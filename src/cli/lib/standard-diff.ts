import type { StandardsManifestEntry } from "./api";
import { sha256 } from "./hashing";
import { readLocalStandard, readStandardLock } from "./standard-lock-file";

export type StandardClassification =
  | { kind: "new"; name: string; remote: StandardsManifestEntry }
  | { kind: "unchanged"; name: string; remote: StandardsManifestEntry }
  | { kind: "remote-only"; name: string; remote: StandardsManifestEntry }
  | { kind: "locally-edited-no-remote-change"; name: string; remote: StandardsManifestEntry }
  | {
      kind: "conflict";
      name: string;
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
    const lock = readStandardLock(repoRoot, remote.name);
    const localContent = readLocalStandard(repoRoot, remote.name);

    if (!lock && !localContent) {
      out.push({ kind: "new", name: remote.name, remote });
      continue;
    }
    if (!lock && localContent) {
      out.push({
        kind: "conflict",
        name: remote.name,
        remote,
        localHash: sha256(localContent),
        lockHash: "(no lock)",
      });
      continue;
    }

    const localHash = localContent ? sha256(localContent) : null;
    const lockHash = lock!.hash;
    if (localHash === lockHash && lockHash === remote.hash) {
      out.push({ kind: "unchanged", name: remote.name, remote });
      continue;
    }
    if (localHash === lockHash && lockHash !== remote.hash) {
      out.push({ kind: "remote-only", name: remote.name, remote });
      continue;
    }
    if (localHash !== lockHash && lockHash === remote.hash) {
      out.push({ kind: "locally-edited-no-remote-change", name: remote.name, remote });
      continue;
    }
    out.push({
      kind: "conflict",
      name: remote.name,
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
