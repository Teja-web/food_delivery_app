/**
 * GET /walkthrough — serves the `coznt walkthrough` bootstrap prompt as
 * text/markdown so a coding agent can fetch it directly per
 * docs/spec/dev-authoring-surface.md §15.
 *
 * Public, unauthenticated — the prompt itself reads no project data; the
 * agent that pastes it calls coznt's MCP verbs separately with the dev's
 * own API key.
 *
 * Cached for an hour at the edge. Bumping `walkthroughVersion` invalidates.
 */

import { walkthroughPrompt, walkthroughVersion } from "@/lib/walkthrough/prompt";

export const dynamic = "force-static";

export async function GET() {
  return new Response(walkthroughPrompt, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Coznt-Walkthrough-Version": walkthroughVersion,
    },
  });
}
