/**
 * MCP tool: get_plans
 *
 * Two modes:
 *
 *   - list (omit `id`): returns metadata for plans matching the filters.
 *   - fetch (provide `id`): returns full body + revisions + approvals for
 *     that one plan.
 *
 * Coznt's analog of SDLC's `get_documents`. Use this BEFORE authoring a
 * follow-on plan (e.g. before running test-plan-generator, fetch the
 * already-approved requirements plans). `kind` filters by document type
 * since coznt unifies all document types under `plans`.
 */

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall, getSessionProject } from "../../session";
import { PLAN_KINDS, PLAN_STATUSES } from "../../../db/schema/plan/plan-kinds";

export const getPlansInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
  id: z
    .string()
    .optional()
    .describe("Specific plan id to fetch full content for. Omit to list."),
  kind: z
    .enum(PLAN_KINDS)
    .optional()
    .describe("Optional filter by document type."),
  status: z
    .enum(PLAN_STATUSES)
    .optional()
    .describe("Optional status filter."),
  slug: z.string().optional().describe("Optional exact-slug filter."),
  includeBody: z
    .boolean()
    .optional()
    .describe("List mode: embed full markdown body in each row (default: metadata only)."),
  limit: z.number().int().min(1).max(200).optional().describe("Default 50, max 200."),
});

export type GetPlansInput = z.infer<typeof getPlansInput>;

export async function runGetPlans(client: CozntClient, input: GetPlansInput) {
  bumpToolCall();

  if (input.id) {
    return client.get<unknown>(`/api/v1/mcp/plans/${encodeURIComponent(input.id)}`);
  }

  const projectId = input.projectId ?? getSessionProject()?.id;
  if (!projectId) {
    throw new Error("No active project. API key resolution failed — verify COZNT_API_KEY is valid, or pass `projectId` explicitly.");
  }
  const params = new URLSearchParams();
  params.set("projectId", projectId);
  if (input.kind) params.set("kind", input.kind);
  if (input.status) params.set("status", input.status);
  if (input.slug) params.set("slug", input.slug);
  if (input.includeBody) params.set("includeBody", "true");
  if (input.limit) params.set("limit", String(input.limit));

  return client.get<unknown>(`/api/v1/mcp/plans?${params.toString()}`);
}
