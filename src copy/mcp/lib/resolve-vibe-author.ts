/**
 * Resolve the local developer's identity for prompt attribution.
 *
 * Order of precedence:
 *   1. COZNT_PROMPT_AUTHOR / COZNT_PROMPT_AUTHOR_EMAIL env vars
 *   2. git config user.name / user.email (from the workspace dir)
 *   3. OS username
 *
 * Pure-local — no platform call. The MCP `get_prompt_author` verb wraps
 * this; the Claude Code hook ports the same logic to JS for offline use.
 */

import { execSync } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { promises as fs } from "node:fs";

export interface VibeAuthor {
  authorName: string;
  authorEmail: string | null;
  authorUsername: string;
}

function runGit(args: string[], cwd: string): string | null {
  try {
    return execSync(`git ${args.join(" ")}`, {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await fs.access(path.join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

export async function resolveVibeAuthor(workspaceDir: string): Promise<VibeAuthor> {
  const username = os.userInfo().username;
  const envName = process.env.COZNT_PROMPT_AUTHOR?.trim();
  const envEmail = process.env.COZNT_PROMPT_AUTHOR_EMAIL?.trim() || null;

  if (envName) {
    return { authorName: envName, authorEmail: envEmail, authorUsername: username };
  }

  if (await isGitRepo(workspaceDir)) {
    const gitName = runGit(["config", "user.name"], workspaceDir);
    const gitEmail = runGit(["config", "user.email"], workspaceDir);
    if (gitName) {
      return {
        authorName: gitName,
        authorEmail: gitEmail || envEmail,
        authorUsername: username,
      };
    }
  }

  return { authorName: username, authorEmail: envEmail, authorUsername: username };
}
