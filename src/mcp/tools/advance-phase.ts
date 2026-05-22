/**
 * MCP tool: advance_phase
 *
 * Advance the project to the next SDLC phase. Returns 409 with the
 * unmet-gates list if any gate in the current phase isn't passed or
 * skipped. On success, updates the session's cached phase so
 * subsequent phase-enforcement checks see the new value.
 *
 * Wraps the existing `/api/v1/projects/[id]/advance-phase` route — no
 * MCP-specific route needed.
 */

import { z } from "zod";

import { CozntClient } from "../client.js";
import { bumpToolCall, getSessionProject, updateSessionPhase } from "../session.js";

export const advancePhaseInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
});

export type AdvancePhaseInput = z.infer<typeof advancePhaseInput>;

interface AdvanceResponse {
  id: string;
  phase: string;
}

export async function runAdvancePhase(client: CozntClient, input: AdvancePhaseInput) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (!projectId) {
    throw new Error("No active project. API key resolution failed — verify COZNT_API_KEY is valid, or pass `projectId` explicitly.");
  }
  const result = await client.post<AdvanceResponse>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/advance-phase`,
  );
  updateSessionPhase(result.phase);
  return {
    project: { id: result.id, phase: result.phase },
    nextStep:
      "Phase advanced. Call `get_my_context` for the new phase's discipline and available tools.",
  };
}
