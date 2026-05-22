/**
 * MCP tool: generate_tests
 *
 * Named convenience verb that delegates to `invoke_skill` with
 * `slug: "test-author"`. Better IDE discoverability than asking
 * agents to find the test-author skill themselves.
 *
 * Returns a clean error if no skill with slug `test-author` is
 * registered in the org — at that point the user should `invoke_skill`
 * directly against whatever skill they have, or register a
 * test-author skill on the platform.
 */

import { z } from "zod";

import { CozntClient, CozntApiError } from "../client.js";
import { bumpToolCall, getSessionProject } from "../session.js";

const TEST_AUTHOR_SLUG = "test-author";

export const generateTestsInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
  planId: z
    .string()
    .optional()
    .describe("Optional: file the generated tests against an existing test_plan."),
  context: z
    .string()
    .optional()
    .describe(
      "What to generate tests for — e.g. a feature description, an ADR id, a PR diff summary.",
    ),
  coverageTarget: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Target coverage 0-1 (passed to the skill as a hint)."),
});

export type GenerateTestsInput = z.infer<typeof generateTestsInput>;

export async function runGenerateTests(client: CozntClient, input: GenerateTestsInput) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (!projectId) {
    throw new Error("No active project. API key resolution failed — verify COZNT_API_KEY is valid, or pass `projectId` explicitly.");
  }
  try {
    return await client.post<unknown>(`/api/v1/skills/${TEST_AUTHOR_SLUG}/invoke`, {
      input: {
        projectId,
        context: input.context,
        coverageTarget: input.coverageTarget,
      },
      entityType: input.planId ? "plan" : undefined,
      entityId: input.planId,
    });
  } catch (err) {
    if (err instanceof CozntApiError && err.status === 404) {
      throw new Error(
        `No skill with slug "${TEST_AUTHOR_SLUG}" registered. Either create one on the platform, ` +
          `or call \`invoke_skill\` directly with a skill you have.`,
      );
    }
    throw err;
  }
}
