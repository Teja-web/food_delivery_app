/**
 * MCP tool: draft_requirement
 *
 * Add a requirement-like draft to the session's local working set.
 * In-memory only — drafts die with the MCP process (by design;
 * matches SDLC's per-agent draft model). Use `push_requirements`
 * with no `items` arg to commit drafts to the platform.
 */

import { z } from "zod";

import { addDraft, bumpToolCall } from "../session.js";

export const draftRequirementInput = z.object({
  kind: z
    .enum(["epic", "feature", "story", "adr", "test_plan", "release_plan", "incident"])
    .optional()
    .describe("Defaults to `story`."),
  title: z.string().min(1),
  summary: z.string().optional(),
  body: z.string().optional(),
  priority: z.enum(["p0", "p1", "p2", "p3"]).optional(),
  effortEstimate: z.string().optional(),
  parentPlanId: z.string().optional().nullable(),
  assigneeId: z.string().optional(),
  assigneeName: z.string().optional(),
});

export type DraftRequirementInput = z.infer<typeof draftRequirementInput>;

export async function runDraftRequirement(_: unknown, input: DraftRequirementInput) {
  bumpToolCall();
  const draft = addDraft(input);
  return {
    draft,
    nextStep:
      "Call `list_draft_requirements` to review, `update_draft_requirement` to edit, or `push_requirements` (no args) to commit all drafts.",
  };
}
