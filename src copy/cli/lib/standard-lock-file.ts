/**
 * Per-artifact local files written by `coznt sync`.
 *
 * Artifacts are passive reference docs, so they live under
 * `.coznt/artifacts/` instead of `.coznt/skills/`.
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export interface StandardLockEntry {
  hash: string;
  version: string;
  syncedAt: string;
  scope: "org" | "project";
  kind: string;
  type?: ".md" | ".txt" | ".html" | ".json";
}

function safeArtifactName(name: string): string {
  const normalized = basename(name).replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").trim();
  return normalized || "artifact.md";
}

export function standardPath(repoRoot: string, name: string): string {
  return join(repoRoot, ".coznt", "artifacts", safeArtifactName(name));
}

export function standardLockPath(repoRoot: string, name: string): string {
  return join(repoRoot, ".coznt", "artifacts", `${safeArtifactName(name)}.lock`);
}

export function readStandardLock(repoRoot: string, name: string): StandardLockEntry | null {
  const path = standardLockPath(repoRoot, name);
  try {
    statSync(path);
  } catch {
    return null;
  }
  return JSON.parse(readFileSync(path, "utf-8")) as StandardLockEntry;
}

export function readLocalStandard(repoRoot: string, name: string): string | null {
  const path = standardPath(repoRoot, name);
  try {
    statSync(path);
  } catch {
    return null;
  }
  return readFileSync(path, "utf-8");
}

export function writeLocalStandard(
  repoRoot: string,
  name: string,
  content: string,
): void {
  const path = standardPath(repoRoot, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf-8");
}

export function writeStandardLock(
  repoRoot: string,
  name: string,
  entry: StandardLockEntry,
): void {
  const path = standardLockPath(repoRoot, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(entry, null, 2) + "\n", "utf-8");
}
