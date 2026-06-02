/**
 * MCP tool: create_requirement
 *
 * Create a single "requirement-like" plan in the session's project.
 * Coznt has no `requirement` plan kind — defaults to `story` (the
 * closest analog). Pass `kind` to create epic/feature/test_plan/etc.
 *
 * For batch creation use `push_requirements`. For draft-then-push
 * workflow use the Tier-3 `draft_requirement` family.
 */

import { z } from "zod";

import { CozntClient } from "../../client.js";
import { bumpToolCall, getSessionProject } from "../../session.js";

export const createRequirementInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
  kind: z
    .enum(["epic", "feature", "story", "adr", "test_plan", "release_plan", "incident"])
    .optional()
    .describe("Plan kind. Defaults to `story` — the closest analog to a requirement."),
  title: z.string().min(1).describe("One-line title."),
  summary: z.string().optional().describe("1-3 sentence description."),
  body: z.string().optional().describe("Markdown body — full requirement content."),
  priority: z.enum(["p0", "p1", "p2", "p3"]).optional(),
  effortEstimate: z.string().optional().describe('Free-form, e.g. "3d" or "M".'),
  parentPlanId: z
    .string()
    .optional()
    .nullable()
    .describe("Parent plan id for stories under features, ADRs under epics, etc."),
  assigneeId: z.string().optional(),
  assigneeName: z.string().optional(),
});

export type CreateRequirementInput = z.infer<typeof createRequirementInput>;

export async function runCreateRequirement(
  client: CozntClient,
  input: CreateRequirementInput,
) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (!projectId) {
    throw new Error("No active project. API key resolution failed — verify COZNT_API_KEY is valid, or pass `projectId` explicitly.");
  }
  const { projectId: _projectId, ...body } = input;
  void _projectId;
  return client.post<unknown>(
    `/api/v1/mcp/projects/${encodeURIComponent(projectId)}/requirements`,
    body,
  );
}
