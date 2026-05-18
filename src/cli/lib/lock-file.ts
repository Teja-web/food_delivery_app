/**
 * Per-skill lock file at `.coznt/skills/<slug>/.lock` (platform) or
 * `.coznt/skills/custom/<slug>/.lock` (customer-authored).
 *
 * Tracks {hash, version, syncedAt} so the next `coznt sync` can detect:
 *   - new entries (no lock)
 *   - unchanged entries (lock hash matches both local + remote)
 *   - remote-only changes (lock matches local; remote differs)
 *   - locally-edited entries (lock matches remote; local file differs)
 *
 * Committed to the repo by design — PR review surfaces choreography
 * version bumps via lock-file diffs.
 *
 * Platform vs custom: same shape, separate subdirectories so the
 * dev's AI editor can distinguish "coznt ships this" from "my org
 * authored this." Helpers accept an explicit `scope` parameter.
 */

import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";

export type ChoreographyScope = "platform" | "custom";

export interface LockEntry {
  hash: string;
  version: string;
  syncedAt: string;
}

function subdir(scope: ChoreographyScope): string {
  return scope === "custom" ? "custom" : "";
}

export function lockPath(
  repoRoot: string,
  slug: string,
  scope: ChoreographyScope = "platform",
): string {
  const sub = subdir(scope);
  return sub
    ? join(repoRoot, ".coznt", "skills", sub, slug, ".lock")
    : join(repoRoot, ".coznt", "skills", slug, ".lock");
}

export function skillPath(
  repoRoot: string,
  slug: string,
  scope: ChoreographyScope = "platform",
): string {
  const sub = subdir(scope);
  return sub
    ? join(repoRoot, ".coznt", "skills", sub, slug, "SKILL.md")
    : join(repoRoot, ".coznt", "skills", slug, "SKILL.md");
}

export function readLock(
  repoRoot: string,
  slug: string,
  scope: ChoreographyScope = "platform",
): LockEntry | null {
  const path = lockPath(repoRoot, slug, scope);
  try {
    statSync(path);
  } catch {
    return null;
  }
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as LockEntry;
}

export function writeLock(
  repoRoot: string,
  slug: string,
  entry: LockEntry,
  scope: ChoreographyScope = "platform",
): void {
  const path = lockPath(repoRoot, slug, scope);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(entry, null, 2) + "\n", "utf-8");
}

export function readLocalSkill(
  repoRoot: string,
  slug: string,
  scope: ChoreographyScope = "platform",
): string | null {
  const path = skillPath(repoRoot, slug, scope);
  try {
    statSync(path);
  } catch {
    return null;
  }
  return readFileSync(path, "utf-8");
}

export function writeLocalSkill(
  repoRoot: string,
  slug: string,
  content: string,
  scope: ChoreographyScope = "platform",
): void {
  const path = skillPath(repoRoot, slug, scope);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf-8");
}
