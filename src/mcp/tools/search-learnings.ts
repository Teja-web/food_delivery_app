/**
 * MCP tool: search_learnings
 *
 * Semantic + keyword search over project_learnings. Returns ranked hits
 * for "what did we decide about auth?" style questions. Read-only;
 * available in every phase. Wraps the `/api/v1/mcp/search/learnings` route.
 */

import { z } from "zod";

import { CozntClient } from "../client.js";
import { bumpToolCall, getSessionProject } from "../session.js";

export const searchLearningsInput = z.object({
  query: z.string().min(1).describe("Free-form query — semantic match against learning bodies."),
  projectId: z.string().optional().describe("Defaults to the session's bound project; pass null for org-wide."),
  limit: z.number().int().min(1).max(100).optional().describe("Default 20, max 100."),
  mode: z
    .enum(["hybrid", "vector", "keyword"])
    .optional()
    .describe(
      "Search mode. `hybrid` (default) = vector + BM25. `vector` = semantic only. `keyword` = BM25 only.",
    ),
});

export type SearchLearningsInput = z.infer<typeof searchLearningsInput>;

export async function runSearchLearnings(client: CozntClient, input: SearchLearningsInput) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  return client.post<unknown>(`/api/v1/mcp/search/learnings`, {
    query: input.query,
    projectId,
    limit: input.limit,
    mode: input.mode,
  });
}
