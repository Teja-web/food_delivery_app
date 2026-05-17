/**
 * Per-skill lock file at `.coznt/skills/<slug>/.lock`.
 *
 * Tracks {hash, version, syncedAt} so the next `coznt sync` can detect:
 *   - new entries (no lock)
 *   - unchanged entries (lock hash matches both local + remote)
 *   - remote-only changes (lock matches local; remote differs)
 *   - locally-edited entries (lock matches remote; local file differs)
 *
 * Committed to the repo by design — PR review surfaces choreography
 * version bumps via lock-file diffs.
 */

import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";

export interface LockEntry {
  hash: string;
  version: string;
  syncedAt: string;
}

export function lockPath(repoRoot: string, slug: string): string {
  return join(repoRoot, ".coznt", "skills", slug, ".lock");
}

export function skillPath(repoRoot: string, slug: string): string {
  return join(repoRoot, ".coznt", "skills", slug, "SKILL.md");
}

export function readLock(repoRoot: string, slug: string): LockEntry | null {
  const path = lockPath(repoRoot, slug);
  try {
    statSync(path);
  } catch {
    return null;
  }
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as LockEntry;
}

export function writeLock(repoRoot: string, slug: string, entry: LockEntry): void {
  const path = lockPath(repoRoot, slug);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(entry, null, 2) + "\n", "utf-8");
}

export function readLocalSkill(repoRoot: string, slug: string): string | null {
  const path = skillPath(repoRoot, slug);
  try {
    statSync(path);
  } catch {
    return null;
  }
  return readFileSync(path, "utf-8");
}

export function writeLocalSkill(repoRoot: string, slug: string, content: string): void {
  const path = skillPath(repoRoot, slug);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf-8");
}
