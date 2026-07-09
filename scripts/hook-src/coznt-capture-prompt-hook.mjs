#!/usr/bin/env node
/**
 * Claude Code UserPromptSubmit hook — coznt prompt capture + scoring.
 *
 * Reads the hook event JSON from stdin, scores the user's prompt locally
 * with the canonical rubric port, fires-and-forgets a POST to the coznt
 * deployment, and emits hook output:
 *   - ALWAYS emits `additionalContext` containing the current-phase
 *     posture (phase name + forbidden actions + governance reminder).
 *     Per-turn injection beats top-of-context decay for project posture.
 *   - Sub-GOOD tier → appends rubric coaching to the posture context.
 *   - Score below COZNT_PROMPT_MIN_SCORE → emit `{decision: "block", reason}`
 *     with posture+coaching attached.
 *
 * Reads `.coznt/project-phase.txt` (written by `get_my_context`) for
 * phase-aware scoring and posture. Reads `.coznt/config.json` for the
 * platform URL and API key reference. Appends every captured prompt to
 * `.coznt/prompt-buffer.jsonl` as a durability hedge — `flush_local_prompts`
 * drains it later.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

import { scorePromptQuality, formatScoreFeedback } from "./coznt-prompt-quality.mjs";
import { resolveVibeAuthor } from "./coznt-author-utils.mjs";

const HOOK_TIMEOUT_MS = 1000;
const COZNT_DIR = ".coznt";
const PHASE_FILE = "project-phase.txt";
const BUFFER_FILE = "prompt-buffer.jsonl";
const CONFIG_FILE = "config.json";

/**
 * Per-phase forbidden actions surfaced to the agent every turn. Keep
 * each list short — these tokens enter the context window on every
 * prompt. Phases mirror src/db/schema/projects.ts.
 */
const PHASE_FORBIDDEN = {
  requirements:
    "scaffolding (create-next-app, npm init), source-code writes, package install, git commits, deploys",
  design:
    "scaffolding, source-code writes outside ADR / storyboard fixtures, deploys",
  development:
    "production deploys, force-push to main, schema migrations without an approved ADR",
  testing:
    "production deploys, source-code changes outside test fixes, schema migrations",
  cicd:
    "force-push to main, source-code changes outside pipeline files, production data writes",
  monitoring:
    "production deploys without release plan, force-push to main, untracked schema migrations",
};

/**
 * Build the per-turn posture text injected into every prompt via
 * `additionalContext`. When the phase file is missing (typical pre-bind
 * state) we still emit a short reminder so the agent knows to call
 * `get_my_context` before acting.
 */
export function buildPhasePosture(phase) {
  if (!phase) {
    return [
      "[coznt] Project not bound this session.",
      "Before any new work, call `mcp__coznt__get_my_context` to learn the current phase and allowed actions.",
      "Do not scaffold, install packages, or write source files until you have done so.",
    ].join("\n");
  }
  const forbidden =
    PHASE_FORBIDDEN[phase] ||
    "see `mcp__coznt__get_my_context` for the allowed-action set";
  return [
    `[coznt] phase=${phase}`,
    `forbidden in this phase: ${forbidden}`,
    "If the user's request requires a forbidden action, surface that to the user before proceeding — do not bypass the framework.",
  ].join("\n");
}

async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function readJsonIfExists(p) {
  try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return null; }
}

async function readPhase(workspaceDir) {
  try {
    const c = await fs.readFile(path.join(workspaceDir, COZNT_DIR, PHASE_FILE), "utf8");
    return c.trim() || null;
  } catch { return null; }
}

async function appendBuffer(workspaceDir, entry) {
  const dir = path.join(workspaceDir, COZNT_DIR);
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(path.join(dir, BUFFER_FILE), JSON.stringify(entry) + "\n", "utf8");
}

function resolveApiKey(apiKeyRef) {
  if (!apiKeyRef) return null;
  if (apiKeyRef.kind === "env" && apiKeyRef.name) {
    return process.env[apiKeyRef.name] || null;
  }
  // OS keychain kind: not accessible from Node without a native dep; the
  // dev's MCP server bin is what holds that. The hook tries env first.
  return process.env.COZNT_API_KEY || null;
}

async function postWithTimeout(url, body, headers, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  let event;
  try {
    const raw = await readStdin();
    event = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    process.exit(0); // never block the user on hook parse failure
  }
  const prompt = event.prompt ?? event.user_prompt ?? "";
  const cwd = event.cwd ?? process.cwd();
  const claudeSessionId = event.session_id ?? null;
  if (!prompt) process.exit(0);

  const phase = await readPhase(cwd);
  const score = scorePromptQuality({ content: prompt, phase });

  const config = await readJsonIfExists(path.join(cwd, COZNT_DIR, CONFIG_FILE));
  const serverUrl = (config?.serverUrl || process.env.COZNT_URL || "").replace(/\/$/, "");
  const projectId = config?.projectId || null;
  const apiKey = resolveApiKey(config?.apiKeyRef);
  const author = resolveVibeAuthor(cwd);
  const localId = randomUUID();

  const bufferEntry = {
    localId,
    capturedAt: new Date().toISOString(),
    projectId,
    mcpSessionId: claudeSessionId,
    role: "USER",
    source: "CLAUDE_CODE",
    content: prompt,
    phase,
    authorName: author.authorName,
    authorUsername: author.authorUsername,
    authorEmail: author.authorEmail,
    prescored: score,
  };

  // Always buffer first — durability before delivery.
  await appendBuffer(cwd, bufferEntry).catch(() => undefined);

  // Best-effort POST. If serverUrl/apiKey missing, skip — buffer holds it.
  if (serverUrl && apiKey) {
    await postWithTimeout(
      `${serverUrl}/api/v1/mcp/prompts`,
      {
        projectId,
        mcpSessionId: claudeSessionId,
        role: "USER",
        source: "CLAUDE_CODE",
        content: prompt,
        phase,
        authorName: author.authorName,
        authorUsername: author.authorUsername,
        authorEmail: author.authorEmail,
        clientLocalId: localId,
        prescored: score,
      },
      { authorization: `Bearer ${apiKey}` },
      HOOK_TIMEOUT_MS,
    );
  }

  // Decide hook output. Posture (phase + forbidden actions) is ALWAYS
  // emitted; rubric coaching is appended on sub-GOOD scores.
  const posture = buildPhasePosture(phase);
  const additionalContext =
    score.tier === "GOOD" ? posture : `${posture}\n\n${formatScoreFeedback(score)}`;

  const minScore = Number(process.env.COZNT_PROMPT_MIN_SCORE || "");
  if (Number.isFinite(minScore) && score.overallScore < minScore) {
    const out = {
      decision: "block",
      reason: `Prompt scored ${score.overallScore} (<${minScore}). ${score.suggestions[0] ?? ""}`,
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext,
      },
    };
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  }

  const out = {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext,
    },
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// Only run as entry point — keep importability for unit tests of the
// exported helpers (buildPhasePosture).
const invokedAsEntry =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("coznt-capture-prompt-hook.mjs") ||
  process.argv[1]?.endsWith("coznt-prompt-hook");
if (invokedAsEntry) {
  main().catch(() => process.exit(0)); // never block on hook crash
}
