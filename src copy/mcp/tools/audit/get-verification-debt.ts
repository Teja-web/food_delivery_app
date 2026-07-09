/**
 * MCP tool: get_verification_debt
 *
 * Compute the verification-debt score for the calling project. The
 * score is derived only from the audit ledger (autonomy distance,
 * open approvals, gate trip rate, unreviewed AI-authored changes) —
 * never from self-report. See `docs/product/verification-debt-thesis.md`.
 *
 * Per Decision #1 the score is materialized in the background; this
 * endpoint reads on demand until the refresh task lands. Read-only;
 * available in every phase.
 */

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall, getSessionProject } from "../../session";

export const getVerificationDebtInput = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      "Optional projectId. Defaults to the session's bound project (auto-resolved from the API key).",
    ),
});

export type GetVerificationDebtInput = z.infer<typeof getVerificationDebtInput>;

export async function runGetVerificationDebt(
  client: CozntClient,
  input: GetVerificationDebtInput,
) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  const query = params.toString();
  return client.get<unknown>(`/api/v1/mcp/verification-debt${query ? `?${query}` : ""}`);
}
