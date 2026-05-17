/**
 * Append `.coznt/.local/` to the repo's `.gitignore` if not already
 * present. `.coznt/skills/` is intentionally NOT gitignored — the
 * pushed choreographies propagate to teammates via `git pull`.
 */

import { readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface GitignoreResult {
  changed: boolean;
  path: string;
}

const COZNT_LOCAL_ENTRY = ".coznt/.local/";
const COZNT_LOCAL_BLOCK = `# coznt local cache\n${COZNT_LOCAL_ENTRY}\n`;

export function ensureCozntLocalGitignored(repoRoot: string = process.cwd()): GitignoreResult {
  const path = join(repoRoot, ".gitignore");
  let content = "";
  try {
    statSync(path);
    content = readFileSync(path, "utf-8");
  } catch {
    // .gitignore doesn't exist yet
  }

  if (content.split("\n").some((line) => line.trim() === COZNT_LOCAL_ENTRY)) {
    return { changed: false, path };
  }

  const newContent = content.length === 0
    ? COZNT_LOCAL_BLOCK
    : content.endsWith("\n")
      ? content + "\n" + COZNT_LOCAL_BLOCK
      : content + "\n\n" + COZNT_LOCAL_BLOCK;

  writeFileSync(path, newContent, "utf-8");
  return { changed: true, path };
}
