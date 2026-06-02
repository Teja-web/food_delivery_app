/**
 * Posture-file fan-out for `coznt connect`.
 *
 * Editor agents auto-load different files at session start. To make the
 * coznt governance discipline visible regardless of editor, we write a
 * managed posture block into the editor-native file plus a cross-tool
 * `AGENTS.md`.
 *
 * Managed-block strategy: every file we touch contains a marker pair
 * (`<!-- coznt:posture:start -->` … `<!-- coznt:posture:end -->`). On
 * re-run, the block between markers is replaced; everything outside is
 * preserved. If the file exists without markers, we append the block.
 *
 * Editor coverage:
 *   - AGENTS.md           — always (Codex CLI, Aider, growing cross-tool convention)
 *   - CLAUDE.md           — when editor is claude-code
 *   - .cursor/rules/coznt.mdc — when editor is cursor (alwaysApply: true frontmatter)
 *   - .rules              — when editor is zed
 *   - other editors       — AGENTS.md only (file-based fallback)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { EditorName } from "./editor-detect.js";

export const POSTURE_START = "<!-- coznt:posture:start -->";
export const POSTURE_END = "<!-- coznt:posture:end -->";

export interface PostureWriteResult {
  path: string;
  /** True when this run modified (or created) the file. */
  changed: boolean;
  /** True when the file already existed before this run. */
  existed: boolean;
  /** True when prior coznt-managed content was replaced. */
  replaced: boolean;
}

/**
 * The body the agent reads. Kept short and load-bearing — every line
 * here trades against attention budget in the agent's context window.
 */
function posturePlainBody(): string {
  return [
    "## Coznt governance — read before acting",
    "",
    "This repo is governed by coznt. Before any new work in this directory:",
    "",
    "1. Call the MCP tool `mcp__coznt__get_my_context` to learn the current phase, allowed actions, and skill autonomy levels.",
    "2. Honor the phase. Each SDLC phase (`requirements`, `design`, `development`, `testing`, `cicd`, `monitoring`) has a different allowed-action set. Do not run package managers, scaffolding tools, or write source files outside the current phase's allowance.",
    "3. When the user's request appears to fall outside the current phase's allowed actions, surface that to the user before proceeding — do not bypass the framework.",
    "4. Treat `.coznt/` and `.mcp.json` as load-bearing project infrastructure. Never move, stash, or delete them to make another tool succeed; diagnose and ask instead.",
    "5. Use coznt MCP verbs (`upsert_plan`, `submit_for_approval`, `invoke_skill`, …) for governed work. Run `mcp__coznt__list_verbs` or read `.coznt/skills/*/SKILL.md` for the verb surface.",
    "",
    "_This block is managed by `coznt connect`. Edit content outside the markers; the block itself is rewritten on re-run._",
  ].join("\n");
}

function wrapBlock(body: string): string {
  return `${POSTURE_START}\n${body}\n${POSTURE_END}`;
}

/**
 * Insert or replace the managed block in `existing`. If the markers are
 * present, replace between them; otherwise append (with a blank-line
 * separator if there's prior content).
 */
function applyBlock(existing: string | null, block: string): string {
  if (existing === null) {
    return `${block}\n`;
  }
  const startIdx = existing.indexOf(POSTURE_START);
  const endIdx = existing.indexOf(POSTURE_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existing.slice(0, startIdx);
    const after = existing.slice(endIdx + POSTURE_END.length);
    return `${before}${block}${after}`;
  }
  const sep = existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
  return `${existing}${sep}${block}\n`;
}

function writeManagedFile(absPath: string, block: string): PostureWriteResult {
  const existed = existsSync(absPath);
  const prior = existed ? readFileSync(absPath, "utf8") : null;
  const next = applyBlock(prior, block);
  const replaced = prior !== null && prior.includes(POSTURE_START);
  if (prior === next) {
    return { path: absPath, changed: false, existed, replaced };
  }
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, next, "utf8");
  return { path: absPath, changed: true, existed, replaced };
}

/** AGENTS.md — plain Markdown, always written. */
function writeAgentsMd(repoRoot: string): PostureWriteResult {
  return writeManagedFile(join(repoRoot, "AGENTS.md"), wrapBlock(posturePlainBody()));
}

/** CLAUDE.md — plain Markdown, Claude Code's project-level context file. */
function writeClaudeMd(repoRoot: string): PostureWriteResult {
  return writeManagedFile(join(repoRoot, "CLAUDE.md"), wrapBlock(posturePlainBody()));
}

/**
 * .cursor/rules/coznt.mdc — Cursor "always apply" rule. MDC frontmatter
 * is YAML between `---` fences. We keep the entire file under coznt's
 * management (no user content expected here) but still honor the
 * marker convention so subsequent versions can rewrite safely.
 */
function writeCursorMdc(repoRoot: string): PostureWriteResult {
  const frontmatter = [
    "---",
    "description: Coznt governance posture",
    "alwaysApply: true",
    "---",
    "",
  ].join("\n");
  const block = `${frontmatter}${wrapBlock(posturePlainBody())}`;
  const path = join(repoRoot, ".cursor", "rules", "coznt.mdc");
  const existed = existsSync(path);
  // Whole-file replace is safe because the file is coznt-owned. The
  // marker pair is still present so the file format stays consistent
  // with the others if a future writer needs partial-edit semantics.
  const prior = existed ? readFileSync(path, "utf8") : null;
  if (prior === block) {
    return { path, changed: false, existed, replaced: existed };
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, block, "utf8");
  return { path, changed: true, existed, replaced: existed };
}

/** .rules — Zed's project rules file, plain text. */
function writeZedRules(repoRoot: string): PostureWriteResult {
  return writeManagedFile(join(repoRoot, ".rules"), wrapBlock(posturePlainBody()));
}

/**
 * Write the AGENTS.md cross-tool file plus the editor-native posture
 * file. Returns one result per file actually touched.
 */
export function writePostureFiles(
  repoRoot: string,
  editor: EditorName,
): PostureWriteResult[] {
  const results: PostureWriteResult[] = [writeAgentsMd(repoRoot)];
  if (editor === "claude-code") results.push(writeClaudeMd(repoRoot));
  if (editor === "cursor") results.push(writeCursorMdc(repoRoot));
  if (editor === "zed") results.push(writeZedRules(repoRoot));
  return results;
}
