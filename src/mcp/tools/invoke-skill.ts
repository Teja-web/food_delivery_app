/**
 * MCP tool: invoke_skill
 *
 * Run a registered skill against an input. The keystone Mode-2 verb —
 * skills are the unit of AI-driven work in coznt's autonomy model.
 *
 * Wraps the existing `/api/v1/skills/[slug]/invoke` endpoint, which:
 *   - resolves the skill (project-scoped or org-wide)
 *   - applies action-policy rules
 *   - runs the prompt + records the result
 *   - appends a `skill_outcomes` row (drives autonomy recompute)
 *
 * `entityType` + `entityId` are optional. When passed, the result is
 * filed against that entity (e.g. attach a generated test_plan body to
 * an existing test_plan id).
 */

import { z } from "zod";

import { CozntClient } from "../client.js";
import { bumpToolCall } from "../session.js";

export const invokeSkillInput = z.object({
  slug: z.string().min(1).describe("Skill slug (e.g. `test-author`, `change-risk-classifier`)."),
  input: z
    .record(z.string(), z.unknown())
    .describe("Freeform JSON input. Shape is documented in the skill's `inputSchema`."),
  entityType: z
    .string()
    .optional()
    .describe("Optional: file result against this entity type (plan / work_item / …)."),
  entityId: z.string().optional().describe("Optional: file result against this entity id."),
  model: z
    .string()
    .optional()
    .describe("Optional model id override. Defaults to the skill's configured model."),
});

export type InvokeSkillInput = z.infer<typeof invokeSkillInput>;

export async function runInvokeSkill(client: CozntClient, input: InvokeSkillInput) {
  bumpToolCall();
  return client.post<unknown>(
    `/api/v1/skills/${encodeURIComponent(input.slug)}/invoke`,
    {
      input: input.input,
      entityType: input.entityType,
      entityId: input.entityId,
      model: input.model,
    },
  );
}
