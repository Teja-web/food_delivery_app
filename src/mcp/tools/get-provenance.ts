/**
 * MCP tool: get_provenance
 *
 * Provenance summary for plans + work_items in the calling project:
 * AI-authored ratio, per-model count, per-skill count, autonomy
 * distribution at generation time. Counts only — never code, never
 * prompt bodies (coznt is not a Git host).
 *
 * Read-only; available in every phase.
 */

import { z } from "zod";

import { CozntClient } from "../client.js";
import { bumpToolCall, getSessionProject } from "../session.js";

export const getProvenanceInput = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      "Optional projectId. Defaults to the session's bound project (auto-resolved from the API key).",
    ),
  windowDays: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe("Trailing window in days. Defaults to 30."),
});

export type GetProvenanceInput = z.infer<typeof getProvenanceInput>;

export async function runGetProvenance(client: CozntClient, input: GetProvenanceInput) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  if (input.windowDays !== undefined) params.set("windowDays", String(input.windowDays));
  const query = params.toString();
  return client.get<unknown>(`/api/v1/mcp/provenance${query ? `?${query}` : ""}`);
}
