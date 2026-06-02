/**
 * MCP tool: get_my_context
 *
 * Returns project + phase + phase-discipline (ALLOWED/FORBIDDEN) + rules
 * + skills the caller can invoke + recent ADRs. This is the agent's
 * orientation call — typically the first tool fired in a session.
 *
 * Borrowed shape from `@ai-sdlc/mcp-advisor`'s `get-context` tool. Wraps
 * coznt's existing `/api/v1/mcp/context` endpoint, so the discipline
 * model (`McpPhaseDisciplineSchema` with allowed/forbidden) flows through
 * unchanged.
 */

import { z } from "zod";

import { CozntClient } from "../../client.js";
import { bumpToolCall } from "../../session.js";
import { writeProjectPhaseCache } from "../../lib/cache-project-phase.js";

export const getMyContextInput = z.object({
  repoUrl: z.string().optional().describe(
    "Optional repo URL hint (e.g. https://github.com/org/repo) so coznt can disambiguate which project this session is for when the API key is org-scoped.",
  ),
  workItemKey: z.string().optional().describe(
    "Optional work item key (e.g. JIRA ticket id) the agent thinks it's working on.",
  ),
});

export type GetMyContextInput = z.infer<typeof getMyContextInput>;

export async function runGetMyContext(client: CozntClient, input: GetMyContextInput) {
  bumpToolCall();
  const params = new URLSearchParams();
  if (input.repoUrl) params.set("repoUrl", input.repoUrl);
  if (input.workItemKey) params.set("workItemKey", input.workItemKey);
  const qs = params.toString();
  const path = `/api/v1/mcp/context${qs ? `?${qs}` : ""}`;
  const result = await client.get<unknown>(path);
  // Side effect: write phase to `.coznt/project-phase.txt` so the
  // UserPromptSubmit hook can score offline. Best-effort — a missing
  // workspace dir or read-only fs is not a context failure.
  try {
    const phase = (result as { project?: { phase?: string } } | undefined)?.project?.phase;
    if (typeof phase === "string" && phase.length > 0) {
      await writeProjectPhaseCache(process.cwd(), phase);
    }
  } catch {
    // ignore — the file cache is a convenience, not a contract
  }
  return result;
}
