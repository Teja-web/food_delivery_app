/**
 * MCP tool: delete_draft_requirement
 *
 * Remove a session-local draft. No effect on the platform — drafts
 * only exist in MCP-process memory until pushed.
 */

import { z } from "zod";

import { bumpToolCall, deleteDraft } from "../session.js";

export const deleteDraftRequirementInput = z.object({
  id: z.string().min(1).describe("Draft id from list_draft_requirements."),
});

export type DeleteDraftRequirementInput = z.infer<typeof deleteDraftRequirementInput>;

export async function runDeleteDraftRequirement(
  _: unknown,
  input: DeleteDraftRequirementInput,
) {
  bumpToolCall();
  const removed = deleteDraft(input.id);
  if (!removed) throw new Error(`No draft with id "${input.id}".`);
  return { id: input.id, deleted: true };
}
