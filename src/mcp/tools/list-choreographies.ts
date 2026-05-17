/**
 * MCP tool: list_choreographies
 *
 * Returns the choreography manifest for the bound project — the lightweight
 * listing the `coznt sync` CLI uses to diff against local `.lock` files
 * before deciding which entries to fetch.
 *
 * Read-only. Available in every phase. Companion to `sync_choreographies`.
 */

import { z } from "zod";

import { CozntClient } from "../client.js";
import { bumpToolCall, getSessionProject } from "../session.js";

export const listChoreographiesInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
});

export type ListChoreographiesInput = z.infer<typeof listChoreographiesInput>;

export async function runListChoreographies(client: CozntClient, input: ListChoreographiesInput) {
  bumpToolCall();
  const params = new URLSearchParams();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (projectId) params.set("projectId", projectId);
  const qs = params.toString();
  return client.get<unknown>(`/api/v1/mcp/choreographies${qs ? `?${qs}` : ""}`);
}
