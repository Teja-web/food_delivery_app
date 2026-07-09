/**
 * MCP tool: search_plans
 *
 * Semantic + keyword search over plans (ADRs, features, stories,
 * release_plans, etc.). The "where was that ADR about authn?" surface.
 */

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall, getSessionProject } from "../../session";

const PLAN_KINDS = [
  "epic",
  "feature",
  "story",
  "adr",
  "test_plan",
  "release_plan",
  "incident",
  "dev_summary",
  "go_live_report",
  "storyboard",
  "cicd_pipeline",
] as const;

const PLAN_STATUSES = ["draft", "in_review", "approved", "in_progress", "completed"] as const;

export const searchPlansInput = z.object({
  query: z.string().min(1),
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
  kinds: z.array(z.enum(PLAN_KINDS)).optional().describe("Narrow to specific plan kinds."),
  statuses: z.array(z.enum(PLAN_STATUSES)).optional().describe("Narrow to specific statuses."),
  limit: z.number().int().min(1).max(100).optional(),
  mode: z.enum(["hybrid", "vector", "keyword"]).optional(),
});

export type SearchPlansInput = z.infer<typeof searchPlansInput>;

export async function runSearchPlans(client: CozntClient, input: SearchPlansInput) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  return client.post<unknown>(`/api/v1/mcp/search/plans`, {
    query: input.query,
    projectId,
    kinds: input.kinds,
    statuses: input.statuses,
    limit: input.limit,
    mode: input.mode,
  });
}
