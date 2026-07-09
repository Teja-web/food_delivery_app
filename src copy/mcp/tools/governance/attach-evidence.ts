/**
 * MCP tool: attach_evidence
 *
 * Attach proof to a project_task (deployment, test_run, metric snapshot,
 * work_item, skill_outcome, incident, or external link). One verb,
 * type-discriminated by `evidenceType`.
 */

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall } from "../../session";
import {
  EVIDENCE_TYPES,
  EVIDENCE_ROLES,
} from "../../../db/schema/evidence-kinds";

export const attachEvidenceInput = z.object({
  projectTaskId: z
    .string()
    .min(1)
    .describe("Project task to attach evidence to."),
  evidenceType: z
    .enum(EVIDENCE_TYPES)
    .describe(
      "Type of evidence. For internal coznt rows pass `evidenceId`; for external systems pass `externalUrl`.",
    ),
  evidenceId: z
    .string()
    .optional()
    .describe("Id of the internal row (deployment / test_run / work_item / etc.)."),
  externalUrl: z
    .string()
    .url()
    .optional()
    .describe("URL when the evidence lives outside coznt."),
  role: z
    .enum(EVIDENCE_ROLES)
    .optional()
    .describe("Semantic role of the evidence relative to the plan."),
  note: z.string().optional().describe("Free-form note from the attacher."),
});

export type AttachEvidenceInput = z.infer<typeof attachEvidenceInput>;

export async function runAttachEvidence(client: CozntClient, input: AttachEvidenceInput) {
  bumpToolCall();
  return client.post<unknown>("/api/v1/mcp/governance/attach-evidence", input);
}
