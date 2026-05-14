#!/usr/bin/env node
/**
 * coznt-mcp CLI entrypoint.
 *
 * Cursor / Claude Code start this via `npx coznt-mcp` (or directly with
 * `node dist/mcp/bin.js`). It speaks MCP over stdio, so the agent harness
 * supervises stdin/stdout.
 *
 * Required env:
 *   COZNT_API_KEY  — project or org-scoped API key from /settings
 *   COZNT_URL      — optional, defaults to http://localhost:3029
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createCozntMcpServer } from "./server.js";

async function main() {
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
