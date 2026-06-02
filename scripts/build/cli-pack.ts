/**
 * cli:pack — produce a self-contained tarball of the `coznt` CLI for
 * `npx -y <url>` / `npm i -g <url>` distribution.
 *
 * Mirrors scripts/mcp-pack.ts. CLI has no third-party runtime deps
 * (only node:* builtins + the isomorphic src/lib/agent-context/host-config module),
 * so the slim package.json declares an empty `dependencies` object.
 *
 * Output: public/install/coznt-cli-<version>.tgz, served statically by
 * Next.js and referenced by docs/user-guide.md and the in-product
 * /api-keys → Host Config panel.
 */

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { deterministicPack } from "../lib/deterministic-pack";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const rootPkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
  version: string;
};

const version = rootPkg.version;
const distDir = join(repoRoot, "dist");
const stageDir = join(distDir, "cli-pkg");
const publicInstallDir = join(repoRoot, "public", "install");

function run(cmd: string, args: string[], cwd: string): void {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed with status ${result.status ?? "null"}`);
  }
}

console.log(`[cli:pack] version ${version}`);

// Don't blow away `dist/` — mcp:pack may have already populated dist/mcp/.
// Just clear our own staging dir.
rmSync(stageDir, { recursive: true, force: true });

console.log("[cli:pack] compiling TypeScript…");
run("npx", ["tsc", "-p", "tsconfig.cli.json"], repoRoot);

console.log("[cli:pack] staging package contents…");
mkdirSync(stageDir, { recursive: true });
cpSync(join(distDir, "cli"), join(stageDir, "cli"), { recursive: true });
// Only copy lib/agent-context/ — mcp:pack may have left other lib/ subtrees in dist/
// (e.g. lib/pipelines/) that the CLI doesn't need.
cpSync(join(distDir, "lib", "agent-context"), join(stageDir, "lib", "agent-context"), { recursive: true });

const stagePkg = {
  name: "coznt-cli",
  version,
  description: "Coznt CLI — connect / sync / status helper for governed AI development.",
  type: "module" as const,
  bin: { coznt: "./cli/cli.js" },
  files: ["cli/**/*.js", "lib/**/*.js"],
  // No third-party runtime deps — CLI uses only node:* builtins.
  dependencies: {} as Record<string, string>,
  engines: { node: ">=20" },
  private: false,
};
writeFileSync(join(stageDir, "package.json"), JSON.stringify(stagePkg, null, 2) + "\n");

const tarballName = `coznt-cli-${version}.tgz`;
const tarballPath = join(publicInstallDir, tarballName);
mkdirSync(publicInstallDir, { recursive: true });

console.log("[cli:pack] writing deterministic tarball…");
await deterministicPack({ stageDir, tarballPath });
console.log(`[cli:pack] → ${tarballPath}`);
console.log("[cli:pack] done.");
