import type { StandardsManifestEntry } from "./api";
import { sha256 } from "./hashing";
import { readLocalStandard, readStandardLock } from "./standard-lock-file";

export type StandardClassification =
  | { kind: "new"; slug: string; remote: StandardsManifestEntry }
  | { kind: "unchanged"; slug: string; remote: StandardsManifestEntry }
  | { kind: "remote-only"; slug: string; remote: StandardsManifestEntry }
  | { kind: "locally-edited-no-remote-change"; slug: string; remote: StandardsManifestEntry }
  | {
      kind: "conflict";
      slug: string;
      remote: StandardsManifestEntry;
      localHash: string;
      lockHash: string;
    };

export function classifyStandards(
  repoRoot: string,
  manifestEntries: StandardsManifestEntry[],
): StandardClassification[] {
  const out: StandardClassification[] = [];
  for (const remote of manifestEntries) {
    const lock = readStandardLock(repoRoot, remote.slug);
    const localContent = readLocalStandard(repoRoot, remote.slug);

    if (!lock && !localContent) {
      out.push({ kind: "new", slug: remote.slug, remote });
      continue;
    }
    if (!lock && localContent) {
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

export function summarizeStandards(classes: StandardClassification[]): {
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
