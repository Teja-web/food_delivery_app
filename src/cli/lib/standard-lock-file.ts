/**
 * Per-standard local files written by `coznt sync`.
 *
 * Standards are passive reference docs, so they live under
 * `.coznt/standards/` instead of `.coznt/skills/`.
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface StandardLockEntry {
  hash: string;
  version: string;
  syncedAt: string;
  scope: "org" | "project";
  kind: string;
}

export function standardPath(repoRoot: string, slug: string): string {
  return join(repoRoot, ".coznt", "standards", `${slug}.md`);
}

export function standardLockPath(repoRoot: string, slug: string): string {
  return join(repoRoot, ".coznt", "standards", `${slug}.lock`);
}

export function readStandardLock(repoRoot: string, slug: string): StandardLockEntry | null {
  const path = standardLockPath(repoRoot, slug);
  try {
    statSync(path);
  } catch {
    return null;
  }
  return JSON.parse(readFileSync(path, "utf-8")) as StandardLockEntry;
}

export function readLocalStandard(repoRoot: string, slug: string): string | null {
  const path = standardPath(repoRoot, slug);
  try {
    statSync(path);
  } catch {
    return null;
  }
  return readFileSync(path, "utf-8");
}

export function writeLocalStandard(repoRoot: string, slug: string, content: string): void {
  const path = standardPath(repoRoot, slug);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf-8");
}

export function writeStandardLock(
  repoRoot: string,
  slug: string,
  entry: StandardLockEntry,
): void {
  const path = standardLockPath(repoRoot, slug);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(entry, null, 2) + "\n", "utf-8");
}
