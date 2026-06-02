/**
 * MCP tool: list_custom_choreographies
 *
 * Returns the manifest of customer-authored choreographies for the
 * bound project — org-wide entries plus project-scoped entries.
 * Distinct from `list_choreographies` which returns platform-shipped
 * choreographies; `sync_choreographies` returns both.
 *
 * Read-only. Available in every phase.
 */

import { z } from "zod";

import { CozntClient } from "../../client.js";
import { bumpToolCall, getSessionProject } from "../../session.js";

export const listCustomChoreographiesInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
});

export type ListCustomChoreographiesInput = z.infer<typeof listCustomChoreographiesInput>;

export async function runListCustomChoreographies(
  client: CozntClient,
  input: ListCustomChoreographiesInput,
) {
  bumpToolCall();
  const params = new URLSearchParams();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (projectId) params.set("projectId", projectId);
  const qs = params.toString();
  return client.get<unknown>(`/api/v1/mcp/choreographies/custom${qs ? `?${qs}` : ""}`);
}
