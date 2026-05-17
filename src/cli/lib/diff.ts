/**
 * Classify each choreography against the local repo state.
 *
 *   new           — no local lock and no local file
 *   unchanged     — local hash matches remote AND local lock
 *   remote-only   — local file matches lock; remote differs (safe overwrite)
 *   locally-edited — local file does NOT match lock (drift)
 *                    Sub-cases:
 *                      • remote also differs → 3-way conflict (prompt)
 *                      • remote matches lock → user edited an entry the
 *                        server hasn't changed; respect their edit (skip)
 */

import { sha256 } from "./hashing.js";
import type { ManifestEntry } from "./api.js";
import { readLock, readLocalSkill } from "./lock-file.js";

export type Classification =
  | { kind: "new"; slug: string; remote: ManifestEntry }
  | { kind: "unchanged"; slug: string; remote: ManifestEntry }
  | { kind: "remote-only"; slug: string; remote: ManifestEntry }
  | { kind: "locally-edited-no-remote-change"; slug: string; remote: ManifestEntry }
  | { kind: "conflict"; slug: string; remote: ManifestEntry; localHash: string; lockHash: string };

export function classify(
  repoRoot: string,
  manifestEntries: ManifestEntry[],
): Classification[] {
  const out: Classification[] = [];
  for (const remote of manifestEntries) {
    const lock = readLock(repoRoot, remote.slug);
    const localContent = readLocalSkill(repoRoot, remote.slug);

    if (!lock && !localContent) {
      out.push({ kind: "new", slug: remote.slug, remote });
      continue;
    }
    if (!lock && localContent) {
      // file exists but no lock — treat as conflict so the user decides
      out.push({
        kind: "conflict",
        slug: remote.slug,
        remote,
        localHash: sha256(localContent),
        lockHash: "(no lock)",
      });
      continue;
    }
    const localHash = localContent ? sha256(localContent) : null;
    const lockHash = lock!.hash;

    if (localHash === lockHash && lockHash === remote.hash) {
      out.push({ kind: "unchanged", slug: remote.slug, remote });
      continue;
    }
    if (localHash === lockHash && lockHash !== remote.hash) {
      out.push({ kind: "remote-only", slug: remote.slug, remote });
      continue;
    }
    if (localHash !== lockHash && lockHash === remote.hash) {
      out.push({ kind: "locally-edited-no-remote-change", slug: remote.slug, remote });
      continue;
    }
    // localHash !== lockHash AND remote.hash !== lockHash → real conflict
    out.push({
      kind: "conflict",
      slug: remote.slug,
      remote,
      localHash: localHash ?? "(missing file but lock exists)",
      lockHash,
    });
  }
  return out;
}

export function summarize(classes: Classification[]): {
  new: number;
  unchanged: number;
  remoteOnly: number;
  localEditNoRemote: number;
  conflict: number;
} {
  let n = 0;
  let u = 0;
  let r = 0;
  let l = 0;
  let c = 0;
  for (const cls of classes) {
    switch (cls.kind) {
      case "new":
        n++;
        break;
      case "unchanged":
        u++;
        break;
      case "remote-only":
        r++;
        break;
      case "locally-edited-no-remote-change":
        l++;
        break;
      case "conflict":
        c++;
        break;
    }
  }
  return { new: n, unchanged: u, remoteOnly: r, localEditNoRemote: l, conflict: c };
}
