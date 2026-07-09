/**
 * Resolve the local developer's identity for prompt attribution.
 * JS port of src/mcp/lib/resolve-vibe-author.ts — no TS imports, no deps.
 */

import { execSync } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { existsSync } from "node:fs";

function runGit(args, cwd) {
  try {
    return execSync(`git ${args.join(" ")}`, {
      cwd, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8",
    }).trim();
  } catch { return null; }
}

export function resolveVibeAuthor(workspaceDir) {
  const username = os.userInfo().username;
  const envName = (process.env.COZNT_PROMPT_AUTHOR || "").trim() || null;
  const envEmail = (process.env.COZNT_PROMPT_AUTHOR_EMAIL || "").trim() || null;
  if (envName) {
    return { authorName: envName, authorEmail: envEmail, authorUsername: username };
  }
  if (existsSync(path.join(workspaceDir, ".git"))) {
    const gitName = runGit(["config", "user.name"], workspaceDir);
    const gitEmail = runGit(["config", "user.email"], workspaceDir);
    if (gitName) {
      return { authorName: gitName, authorEmail: gitEmail || envEmail, authorUsername: username };
    }
  }
  return { authorName: username, authorEmail: envEmail, authorUsername: username };
}
