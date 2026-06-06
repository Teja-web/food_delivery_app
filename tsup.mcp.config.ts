import { defineConfig } from "tsup";

/**
 * Build config for the coznt-mcp CLI tarball.
 *
 * Replaces a raw `tsc -p tsconfig.mcp.json` emit. tsup (esbuild under the hood)
 * tree-shakes unused exports, so MCP source can pull constants from the full
 * Drizzle schema files without dragging the table builders or `drizzle-orm`
 * into the runtime bundle.
 *
 * Outputs:
 *   dist/mcp/bin.js   — bundled entrypoint, shebang preserved
 *
 * Externals (must be installed by the consumer; declared in the slim
 * package.json written by scripts/build/mcp-pack.ts):
 *   @modelcontextprotocol/sdk, zod
 */
export default defineConfig({
  entry: { bin: "src/mcp/bin.ts" },
  outDir: "dist/mcp",
  format: "esm",
  target: "node20",
  platform: "node",
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  dts: false,
  external: ["@modelcontextprotocol/sdk", "zod"],
});
