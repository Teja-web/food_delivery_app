/**
 * Append coznt-specific entries to the repo's `.gitignore`:
 *
 * - `.coznt/.local/` — per-developer cache, never shared
 * - `.mcp.json` — Claude Code's MCP config. Contains the literal API
 *   key (or an env-var reference). Always-ignored regardless of editor
 *   choice; if the editor is something other than claude-code, the file
 *   simply won't exist locally, and the ignore line is harmless.
 *
 * `.coznt/skills/` is intentionally NOT gitignored — the pushed
 * choreographies propagate to teammates via `git pull`.
 */

import { readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface GitignoreResult {
  changed: boolean;
  path: string;
  addedEntries: string[];
}

const COZNT_ENTRIES: { entry: string; comment: string }[] = [
  { entry: ".coznt/.local/", comment: "# coznt local cache" },
  { entry: ".mcp.json", comment: "# coznt MCP config — holds the plaintext API key" },
];

export function ensureCozntLocalGitignored(repoRoot: string = process.cwd()): GitignoreResult {
  const path = join(repoRoot, ".gitignore");
  let content = "";
  try {
    statSync(path);
    content = readFileSync(path, "utf-8");
  } catch {
    // .gitignore doesn't exist yet
  }

  const existingLines = new Set(
    content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );

  const toAdd = COZNT_ENTRIES.filter(({ entry }) => !existingLines.has(entry));
  if (toAdd.length === 0) {
    return { changed: false, path, addedEntries: [] };
  }

  const block = toAdd.map(({ comment, entry }) => `${comment}\n${entry}`).join("\n");
  const sep = content.length === 0 ? "" : content.endsWith("\n\n") ? "" : content.endsWith("\n") ? "\n" : "\n\n";
  const newContent = content + sep + block + "\n";

  writeFileSync(path, newContent, "utf-8");
  return { changed: true, path, addedEntries: toAdd.map((e) => e.entry) };
}
