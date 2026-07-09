/**
 * MCP tool: list_governance_records
 *
 * Read governance records targeting one project_task. Optionally filter
 * by kind (`gate` | `approval` | `review` | `exception`) and / or status.
 */

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall } from "../../session";
import {
  GOVERNANCE_KINDS,
  GOVERNANCE_RECORD_STATUSES,
} from "../../../db/schema/governance/governance-kinds";

export const listGovernanceRecordsInput = z.object({
  projectTaskId: z.string().min(1).describe("Project task whose records to list."),
  kind: z.enum(GOVERNANCE_KINDS).optional().describe("Filter by record kind."),
  status: z
    .enum(GOVERNANCE_RECORD_STATUSES)
    .optional()
    .describe("Filter by status."),
});

export type ListGovernanceRecordsInput = z.infer<typeof listGovernanceRecordsInput>;

export async function runListGovernanceRecords(
  client: CozntClient,
  input: ListGovernanceRecordsInput,
) {
  bumpToolCall();
  const params = new URLSearchParams();
  params.set("projectTaskId", input.projectTaskId);
  if (input.kind) params.set("kind", input.kind);
  if (input.status) params.set("status", input.status);
  return client.get<unknown>(
    `/api/v1/mcp/governance/list-governance-records?${params.toString()}`,
  );
}
