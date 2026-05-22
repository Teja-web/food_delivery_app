/**
 * MCP tool: get_assigned_work
 *
 * Open work in the project — in-progress plans + open work_items. By
 * default returns everything open; pass `assigneeEmail` to narrow to
 * one person. Plans filter by `assigneeName` (best-effort, schema
 * limitation); work_items filter by `assigneeEmail`.
 *
 * Ported from SDLC's get_assigned_work.
 */

import { z } from "zod";

import { CozntClient } from "../client.js";
import { bumpToolCall, getSessionProject } from "../session.js";

export const getAssignedWorkInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
  assigneeEmail: z
    .string()
    .optional()
    .describe(
      "Filter to one assignee. For plans this is matched against `assigneeName`; for work_items against `assigneeEmail`.",
    ),
});

export type GetAssignedWorkInput = z.infer<typeof getAssignedWorkInput>;

export async function runGetAssignedWork(client: CozntClient, input: GetAssignedWorkInput) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (!projectId) {
    throw new Error("No active project. API key resolution failed — verify COZNT_API_KEY is valid, or pass `projectId` explicitly.");
  }
  const params = new URLSearchParams();
  if (input.assigneeEmail) params.set("assigneeEmail", input.assigneeEmail);
  const qs = params.toString();
  return client.get<unknown>(
    `/api/v1/mcp/projects/${encodeURIComponent(projectId)}/assigned-work${qs ? `?${qs}` : ""}`,
  );
}
