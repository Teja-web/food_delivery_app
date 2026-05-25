/**
 * prompt-hook:pack — bundle scripts/hook-src/*.mjs as an npx-runnable tarball.
 *
 * Pipeline:
 *   1. Read version from root package.json.
 *   2. Stage the three .mjs files + a slim package.json into dist/prompt-hook/.
 *   3. `npm pack` to produce coznt-prompt-hook-<version>.tgz.
 *   4. Move into public/install/, and write version-pin pointer.
 *
 * The tarball's bin entry is coznt-prompt-hook → coznt-capture-prompt-hook.mjs.
 * Claude Code invokes `npx -y <url>/install/coznt-prompt-hook/latest` and
 * Node runs the bin directly on stdin from the hook event.
 */

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const rootPkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
  version: string;
};
const version = rootPkg.version;

const distDir = join(repoRoot, "dist", "prompt-hook");
const publicInstallDir = join(repoRoot, "public", "install");

function run(cmd: string, args: string[], cwd: string): void {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed`);
}

console.log(`[prompt-hook:pack] version ${version}`);

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

const hookSrcDir = join(repoRoot, "scripts", "hook-src");
for (const f of [
  "coznt-prompt-quality.mjs",
  "coznt-author-utils.mjs",
  "coznt-capture-prompt-hook.mjs",
]) {
  cpSync(join(hookSrcDir, f), join(distDir, f));
}

writeFileSync(
  join(distDir, "package.json"),
  JSON.stringify(
    {
      name: "coznt-prompt-hook",
      version,
      description: "Coznt UserPromptSubmit hook — captures prompts, scores locally, can block.",
      type: "module",
      bin: { "coznt-prompt-hook": "./coznt-capture-prompt-hook.mjs" },
      files: ["*.mjs"],
      engines: { node: ">=20" },
      private: false,
    },
    null,
    2,
  ) + "\n",
);

run("chmod", ["+x", "coznt-capture-prompt-hook.mjs"], distDir);

console.log("[prompt-hook:pack] npm pack…");
run("npm", ["pack", "--silent"], distDir);

const tarballName = `coznt-prompt-hook-${version}.tgz`;
mkdirSync(publicInstallDir, { recursive: true });
const tarballSrc = join(distDir, tarballName);
const tarballDst = join(publicInstallDir, tarballName);
renameSync(tarballSrc, tarballDst);

console.log(`[prompt-hook:pack] → ${tarballDst}`);
console.log("[prompt-hook:pack] done.");
