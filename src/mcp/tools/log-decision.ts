/**
 * MCP tool: log_decision
 *
 * Creates an Architecture Decision Record. In coznt, ADRs are `plan` rows
 * with `kind: "adr"` — one of the polymorphic plan kinds. Borrowed from
 * skothapalli's `log-decision`; adapted to coznt's plan-with-kind model.
 *
 * Discipline: ADRs are typically the Design phase's signature artifact.
 * Server-side rejects the call if FORBIDDEN for the project's current
 * phase (the phase-enforcement check lives in the route handler).
 */

import { z } from "zod";

import { CozntClient } from "../client.js";
import { bumpToolCall } from "../session.js";

export const logDecisionInput = z.object({
  projectId: z.string().min(1).describe("Coznt project id (from get_my_context)."),
  title: z.string().min(1).describe("Short ADR title — should describe the decision, not the question."),
  summary: z.string().min(1).describe("1-3 sentence summary of the decision."),
  body: z
    .string()
    .optional()
    .describe(
      "Full markdown body. Suggested sections: Context, Decision, Consequences, Alternatives Considered.",
    ),
  assigneeName: z.string().optional().describe("Who's accountable for the decision."),
});

export type LogDecisionInput = z.infer<typeof logDecisionInput>;

export async function runLogDecision(client: CozntClient, input: LogDecisionInput) {
  bumpToolCall();
  return client.post<unknown>("/api/v1/mcp/decisions", input);
}
