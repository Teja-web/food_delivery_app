/**
 * Deterministic tarball packer for the *-pack.ts scripts.
 *
 * Replaces `npm pack` (whose output embeds file mtimes, uid/gid, and
 * filesystem-order metadata — different bytes on every run, even for
 * identical sources). Deterministic output means:
 *
 *   same source tree → same tarball bytes → same sha512
 *
 * That property makes the pinned tarball URL safe to re-serve: pnpm
 * caches the sha512 against the URL on first install, and every
 * subsequent rebuild produces matching bytes, so `pnpm i -g <url>`
 * stays a one-shot operation.
 *
 * How:
 *   - Walk the stage dir, build a sorted flat file list (deterministic order).
 *   - Pass to tar.create with portable=true (strips uid/gid/uname/gname),
 *     mtime=epoch (zero out per-file timestamps), noPax=true (no PAX headers
 *     that vary by tar version), gzip=true (minizlib writes mtime=0 in the
 *     gzip header by default), prefix=package (npm-compatible layout).
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import * as tar from "tar";

function collectFiles(rootDir: string, rel = ""): string[] {
  const out: string[] = [];
  const here = rel ? join(rootDir, rel) : rootDir;
  for (const name of readdirSync(here).sort()) {
    const fullRel = rel ? `${rel}/${name}` : name;
    const st = statSync(join(rootDir, fullRel));
    if (st.isDirectory()) {
      out.push(...collectFiles(rootDir, fullRel));
    } else {
      out.push(fullRel);
    }
  }
  return out;
}

export async function deterministicPack(opts: {
  stageDir: string;
  tarballPath: string;
}): Promise<void> {
  const files = collectFiles(opts.stageDir);
  await tar.create(
    {
      file: opts.tarballPath,
      cwd: opts.stageDir,
      prefix: "package",
      portable: true,
      mtime: new Date(0),
      gzip: true,
      noPax: true,
    },
    files,
  );
}
