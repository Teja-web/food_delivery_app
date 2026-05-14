/**
 * MCP tool: mark_gate_passed
 *
 * Flips a phase gate to `passed`. coznt's `tryAdvancePhase` then runs,
 * potentially auto-advancing the project to the next phase.
 *
 * Discipline checks live server-side (gate must be in the project's
 * current phase, API-key project scope must match) — see
 * `src/app/api/v1/mcp/gates/[id]/mark-passed/route.ts`. The tool just
 * surfaces a thin wrapper.
 */

import { z } from "zod";

import { CozntClient } from "../client.js";
import { bumpToolCall } from "../session.js";

export const markGatePassedInput = z.object({
  gateId: z.string().min(1).describe("The phase_gate id from get_my_context."),
});

export type MarkGatePassedInput = z.infer<typeof markGatePassedInput>;

export async function runMarkGatePassed(client: CozntClient, input: MarkGatePassedInput) {
  bumpToolCall();
  return client.post<unknown>(`/api/v1/mcp/gates/${encodeURIComponent(input.gateId)}/mark-passed`);
}
