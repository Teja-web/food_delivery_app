#!/usr/bin/env node
/**
 * Claude Code UserPromptSubmit hook — coznt prompt capture + scoring.
 *
 * Reads the hook event JSON from stdin, scores the user's prompt locally
 * with the canonical rubric port, fires-and-forgets a POST to the coznt
 * deployment, and emits hook output:
 *   - GOOD tier → silent (exit 0).
 *   - Sub-GOOD tier → emit `additionalContext` with feedback so the
 *     model sees the coaching alongside the user's prompt.
 *   - Score below COZNT_PROMPT_MIN_SCORE → emit `{decision: "block", reason}`.
 *
 * Reads `.coznt/project-phase.txt` (written by `get_my_context`) for
 * phase-aware scoring. Reads `.coznt/config.json` for the platform URL
 * and API key reference. Appends every captured prompt to
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

  // Decide hook output.
  const minScore = Number(process.env.COZNT_PROMPT_MIN_SCORE || "");
  if (Number.isFinite(minScore) && score.overallScore < minScore) {
    const out = {
      decision: "block",
      reason: `Prompt scored ${score.overallScore} (<${minScore}). ${score.suggestions[0] ?? ""}`,
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: formatScoreFeedback(score),
      },
    };
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  }
  if (score.tier === "GOOD") {
    process.exit(0); // silent
  }
  const out = {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: formatScoreFeedback(score),
    },
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

main().catch(() => process.exit(0)); // never block on hook crash
