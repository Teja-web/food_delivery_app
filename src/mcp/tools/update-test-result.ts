/**
 * MCP tool: update_test_result
 *
 * Record a test run result. Wraps the existing /api/v1/test-runs POST
 * — no MCP-scoped route needed since the agent surface already covers
 * it. The result feeds the `coverage` and `tests passing` gate
 * validators in the next phase-checklist evaluation.
 */

import { z } from "zod";

import { CozntClient } from "../client.js";
import { bumpToolCall, getSessionProject } from "../session.js";

export const updateTestResultInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
  planId: z.string().optional().describe("Optional test_plan id this run executes."),
  suite: z.string().optional().describe('Suite name, e.g. "unit", "e2e".'),
  commitSha: z.string().optional(),
  branch: z.string().optional(),
  status: z.enum(["passed", "failed", "errored", "skipped"]),
  total: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative().optional().default(0),
  durationMs: z.number().int().nonnegative().optional(),
  coverage: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Reported coverage 0–1 (e.g. 0.82 for 82%)."),
  ciRunUrl: z.string().optional(),
});

export type UpdateTestResultInput = z.infer<typeof updateTestResultInput>;

export async function runUpdateTestResult(client: CozntClient, input: UpdateTestResultInput) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (!projectId) {
    throw new Error("No active project. Call `set_project` first, or pass `projectId`.");
  }
  return client.post<unknown>("/api/v1/test-runs", { ...input, projectId });
}
