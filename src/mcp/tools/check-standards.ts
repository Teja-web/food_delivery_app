/**
 * MCP tool: check_standards
 *
 * Run project rules against a proposed plan body or a proposed action
 * *before* it lands. Advisory — nothing is persisted. The agent uses
 * this to self-correct before calling a write verb.
 *
 * One of `plan` or `action` is required:
 *   - plan   → checks keyword-presence rules (required/forbidden text)
 *   - action → checks action-policy rules (blocked commands, paths, etc.)
 *
 * Ported from SDLC's check_standards (which calls /api/check-standards
 * with body content). Coznt routes through `rule-engine.ts`'s already-
 * shipped validators.
 */

import { z } from "zod";

import { CozntClient } from "../client.js";
import { bumpToolCall, getSessionProject } from "../session.js";

export const checkStandardsInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
  plan: z
    .object({
      kind: z.enum([
        "epic",
        "feature",
        "story",
        "adr",
        "test_plan",
        "release_plan",
        "incident",
      ]),
      title: z.string().min(1),
      summary: z.string().optional(),
      body: z.string().optional(),
    })
    .optional()
    .describe(
      "Proposed plan content. Runs keyword-presence rules against title+summary+body.",
    ),
  action: z
    .object({
      appliesTo: z.enum(["skill", "task", "deployment"]),
      command: z.string().optional(),
      paths: z.array(z.string()).optional(),
      fileCount: z.number().int().nonnegative().optional(),
      hasTests: z.boolean().optional(),
    })
    .optional()
    .describe(
      "Proposed action. Runs action-policy rules (blocked commands/paths, requireTests, maxFilesPerChange).",
    ),
});

export type CheckStandardsInput = z.infer<typeof checkStandardsInput>;

export async function runCheckStandards(client: CozntClient, input: CheckStandardsInput) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (!projectId) {
    throw new Error("No active project. API key resolution failed — verify COZNT_API_KEY is valid, or pass `projectId` explicitly.");
  }
  if (!input.plan && !input.action) {
    throw new Error("Provide either `plan` or `action` to check.");
  }
  return client.post<unknown>("/api/v1/mcp/check-standards", {
    projectId,
    plan: input.plan,
    action: input.action,
  });
}
