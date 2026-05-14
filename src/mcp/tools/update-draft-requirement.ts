/**
 * MCP tool: update_draft_requirement
 *
 * Patch a session-local draft by its id. Only the fields you pass are
 * changed; everything else is preserved. Returns the updated draft.
 */

import { z } from "zod";

import { bumpToolCall, updateDraft } from "../session.js";

export const updateDraftRequirementInput = z.object({
  id: z.string().min(1).describe("Draft id from list_draft_requirements."),
  kind: z
    .enum(["epic", "feature", "story", "adr", "test_plan", "release_plan", "incident"])
    .optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  body: z.string().optional(),
  priority: z.enum(["p0", "p1", "p2", "p3"]).optional(),
  effortEstimate: z.string().optional(),
  parentPlanId: z.string().optional().nullable(),
  assigneeId: z.string().optional(),
  assigneeName: z.string().optional(),
});

export type UpdateDraftRequirementInput = z.infer<typeof updateDraftRequirementInput>;

export async function runUpdateDraftRequirement(
  _: unknown,
  input: UpdateDraftRequirementInput,
) {
  bumpToolCall();
  const { id, ...patch } = input;
  const updated = updateDraft(id, patch);
  if (!updated) throw new Error(`No draft with id "${id}".`);
  return { draft: updated };
}
