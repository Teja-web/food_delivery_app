/**
 * MCP tool: sync_choreographies
 *
 * Returns the full content bundle for the bound project's choreographies.
 * Optionally narrowed to a `slugs` filter. The `coznt sync` CLI uses this
 * after diffing the manifest from `list_choreographies`.
 *
 * Read-only. Available in every phase. Distribution is orthogonal to
 * phase enforcement.
 */

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall, getSessionProject } from "../../session";

export const syncChoreographiesInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
  slugs: z
    .array(z.string())
    .optional()
    .describe(
      "Optional subset of choreography slugs to fetch. Order is preserved in the response. Unknown slugs error.",
    ),
});

export type SyncChoreographiesInput = z.infer<typeof syncChoreographiesInput>;

export async function runSyncChoreographies(client: CozntClient, input: SyncChoreographiesInput) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  return client.post<unknown>(`/api/v1/mcp/choreographies/sync`, {
    projectId,
    slugs: input.slugs,
  });
}
