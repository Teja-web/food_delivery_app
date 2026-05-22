/**
 * MCP tool: get_design_context
 *
 * Richer-than-orientation view for design/development/testing phases.
 * Returns ADRs *with their full bodies* (not just titles like
 * get_my_context), active features+stories, and linked work_items.
 *
 * Use when the agent needs to consult prior architectural decisions
 * or know what features are in flight.
 */

import { z } from "zod";

import { CozntClient } from "../client.js";
import { bumpToolCall, getSessionProject } from "../session.js";

export const getDesignContextInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
});

export type GetDesignContextInput = z.infer<typeof getDesignContextInput>;

export async function runGetDesignContext(
  client: CozntClient,
  input: GetDesignContextInput,
) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (!projectId) {
    throw new Error("No active project. API key resolution failed — verify COZNT_API_KEY is valid, or pass `projectId` explicitly.");
  }
  return client.get<unknown>(
    `/api/v1/mcp/projects/${encodeURIComponent(projectId)}/design-context`,
  );
}
