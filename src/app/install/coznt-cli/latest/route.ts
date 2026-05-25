/**
 * GET /install/coznt-cli/latest
 *
 * Redirects to the CLI tarball matching this deployment's current version.
 * Lets docs and one-liners (`npx -y <coznt>/install/coznt-cli/latest …`)
 * stay version-agnostic; `coznt sync` reads the redirect target to detect
 * drift between the dev's installed CLI and what this server now serves.
 */

import { redirect } from "next/navigation";

import { MCP_VERSION } from "@/lib/mcp/version";

export function GET(): never {
  redirect(`/install/coznt-cli-${MCP_VERSION}.tgz`);
}
