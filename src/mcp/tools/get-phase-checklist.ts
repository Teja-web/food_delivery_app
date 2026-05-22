/**
 * MCP tool: get_phase_checklist
 *
 * What needs to happen before the current phase can advance. Returns
 * gates with their statuses, counts, and a `readyToAdvance` boolean.
 * The agent's "am I clear to move forward?" check.
 *
 * Ported from SDLC's get_phase_checklist (in project-context.ts).
 */

import { z } from "zod";

import { CozntClient } from "../client.js";
import { bumpToolCall, getSessionProject } from "../session.js";

export const getPhaseChecklistInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
});

export type GetPhaseChecklistInput = z.infer<typeof getPhaseChecklistInput>;

export async function runGetPhaseChecklist(
  client: CozntClient,
  input: GetPhaseChecklistInput,
) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (!projectId) {
    throw new Error("No active project. API key resolution failed — verify COZNT_API_KEY is valid, or pass `projectId` explicitly.");
  }
  return client.get<unknown>(
    `/api/v1/mcp/projects/${encodeURIComponent(projectId)}/phase-checklist`,
  );
}
