/**
 * MCP tool: get_outcomes
 *
 * List recent `skill_outcomes` for introspection. Use this to answer
 * "did my last invocation of {skill} succeed?" without leaving the IDE.
 *
 * Read-only. Defaults to the session's bound project; omit `skillSlug`
 * to see outcomes from every skill that ran on the project.
 */

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall, getSessionProject } from "../../session";

export const getOutcomesInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
  skillSlug: z.string().optional().describe("Optional filter to a single skill."),
  limit: z.number().int().min(1).max(100).optional().describe("Default 20, max 100."),
});

export type GetOutcomesInput = z.infer<typeof getOutcomesInput>;

export async function runGetOutcomes(client: CozntClient, input: GetOutcomesInput) {
  bumpToolCall();
  const params = new URLSearchParams();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (projectId) params.set("projectId", projectId);
  if (input.skillSlug) params.set("skillSlug", input.skillSlug);
  if (input.limit) params.set("limit", String(input.limit));
  const qs = params.toString();
  return client.get<unknown>(`/api/v1/mcp/outcomes${qs ? `?${qs}` : ""}`);
}
