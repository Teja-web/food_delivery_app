#!/usr/bin/env node
/**
 * coznt-mcp CLI entrypoint.
 *
 * Cursor / Claude Code start this via `npx coznt-mcp` (or directly with
 * `node dist/mcp/bin.js`). It speaks MCP over stdio, so the agent harness
 * supervises stdin/stdout.
 *
 * Required env:
 *   COZNT_API_KEY  — project-pinned API key minted at /api-keys
 *   COZNT_URL      — optional, defaults to http://localhost:3029
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { MCP_VERSION } from "../lib/agent-context/version.js";
import { createCozntMcpServer } from "./server.js";

async function main() {
  // Smoke-test affordance: `npx -y <coznt-url>/install/coznt-mcp/latest --version`
  // should print and exit so operators can verify the install endpoint without
  // needing an API key or a live stdio peer.
  const arg = process.argv[2];
  if (arg === "--version" || arg === "-v") {
    process.stdout.write(`${MCP_VERSION}\n`);
    return;
  }
  if (arg === "--help" || arg === "-h") {
    process.stdout.write(
      `coznt-mcp ${MCP_VERSION}\n\n` +
        `Usage: coznt-mcp              Start the MCP server over stdio.\n` +
        `       coznt-mcp --version    Print version and exit.\n\n` +
        `Required env: COZNT_API_KEY. Optional: COZNT_URL (default http://localhost:3029).\n`,
    );
    return;
  }
  const server = createCozntMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // The MCP SDK keeps the process alive while the transport is open. No
  // explicit loop needed.
}

main().catch((err) => {
  // Errors here are pre-handshake (bad env, transport setup). Tool-call
  // errors are returned to the agent inline.
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`coznt-mcp failed to start: ${msg}\n`);
  process.exit(1);
});
