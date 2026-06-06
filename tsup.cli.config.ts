import { defineConfig } from "tsup";

/**
 * Build config for the coznt CLI tarball.
 *
 * The CLI shares src/mcp/server.ts with the MCP bundle (for the `coznt call`
 * subcommand which dispatches MCP tools locally). tsup tree-shakes unused
 * exports so this is fine — only what cli.ts transitively touches ships.
 *
 * Outputs:
 *   dist/cli/cli.js  — bundled entrypoint, shebang from source preserved
 *
 * The CLI declares no third-party runtime deps (slim package.json from
 * scripts/build/cli-pack.ts). Anything it imports must bundle in.
 */
export default defineConfig({
  entry: { cli: "src/cli/cli.ts" },
  outDir: "dist/cli",
  format: "esm",
  target: "node20",
  platform: "node",
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  dts: false,
  // CLI ships with zero runtime deps — force-bundle zod (and anything else
  // tsup would otherwise treat as external because it's in the repo
  // package.json). The slim package.json from scripts/build/cli-pack.ts
  // declares `dependencies: {}`, so nothing is installed at consumer time.
  noExternal: [/.*/],
});
