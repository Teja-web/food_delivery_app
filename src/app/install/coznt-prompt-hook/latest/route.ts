/**
 * GET /install/coznt-prompt-hook/latest
 *
 * Redirects to the prompt-hook tarball matching this deployment's
 * current version. The hook is invoked by Claude Code's UserPromptSubmit
 * via `npx -y <coznt>/install/coznt-prompt-hook/latest`.
 */

import { redirect } from "next/navigation";

import { MCP_VERSION } from "@/lib/mcp/version";

export function GET(): never {
  redirect(`/install/coznt-prompt-hook-${MCP_VERSION}.tgz`);
}
