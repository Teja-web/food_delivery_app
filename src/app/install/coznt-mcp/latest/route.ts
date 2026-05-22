/**
 * GET /install/coznt-mcp/latest
 *
 * Redirects to the tarball matching this coznt instance's current version.
 * Useful when a developer wants a config snippet that auto-tracks server
 * upgrades — but most hosts should pin to a versioned URL so npm's URL-keyed
 * cache stays hot. HostConfigPanel emits the pinned URL by default.
 *
 * The actual tarball is served statically from `public/install/`. We don't
 * gate this endpoint: the binary is published code with no embedded secrets —
 * the API key lives in the host's env, not in the artifact. If a future
 * threat model requires download gating, swap this for a token-checking
 * route handler and serve from outside `public/`.
 */

import { redirect } from "next/navigation";

import { MCP_VERSION } from "@/lib/mcp/version";

export function GET(): never {
  redirect(`/install/coznt-mcp-${MCP_VERSION}.tgz`);
}
