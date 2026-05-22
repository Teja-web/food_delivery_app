/**
 * MCP tool: get_project_status
 *
 * Compact "where are we?" snapshot for the session's bound project.
 * Returns current phase, gate counts (with named pending gates),
 * open-approvals count, and last-deploy info.
 *
 * Distinct from `get_my_context` — that's the full briefing (rules,
 * skills, ADRs, phase discipline). This is the quick check before doing
 * work or deciding to advance phase.
 *
 * Ported from `/Users/ram/Projects/SDLC/apps/mcp-server/src/tools/get-project-status.ts`.
 * Resolves projectId from the local session (auto-bound from the API key's
 * pinned project on the first tool call).
 */

import { z } from "zod";

import { CozntClient } from "../client.js";
import { bumpToolCall, getSessionProject } from "../session.js";

export const getProjectStatusInput = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      "Project id. Optional — defaults to the session's bound project (auto-resolved from the API key).",
    ),
});

export type GetProjectStatusInput = z.infer<typeof getProjectStatusInput>;

export async function runGetProjectStatus(client: CozntClient, input: GetProjectStatusInput) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (!projectId) {
    throw new Error(
      "No active project. API key resolution failed — verify COZNT_API_KEY is valid, or pass `projectId` explicitly.",
    );
  }
  return client.get<unknown>(`/api/v1/mcp/projects/${encodeURIComponent(projectId)}/status`);
}
