/**
 * GET /install/coznt-prompt-hook/version
 *
 * Returns the plain-text version of the prompt-hook tarball this
 * deployment serves. `coznt sync` uses it to detect drift between
 * the version recorded in `.coznt/config.json` and what's live.
 */

import { MCP_VERSION } from "@/lib/mcp/version";

export function GET(): Response {
  return new Response(MCP_VERSION + "\n", {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
