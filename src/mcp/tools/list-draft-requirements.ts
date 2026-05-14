/**
 * MCP tool: list_draft_requirements
 *
 * Return the session's local requirement drafts. Ephemeral —
 * cleared on push or process exit.
 */

import { z } from "zod";

import { bumpToolCall, listDrafts } from "../session.js";

export const listDraftRequirementsInput = z.object({});

export type ListDraftRequirementsInput = z.infer<typeof listDraftRequirementsInput>;

export async function runListDraftRequirements(_: unknown, __: ListDraftRequirementsInput) {
  bumpToolCall();
  const drafts = listDrafts();
  return {
    total: drafts.length,
    drafts,
    nextStep:
      drafts.length === 0
        ? "No drafts. Use `draft_requirement` to compose one locally before pushing to the platform."
        : "Use `push_requirements` (no args) to commit all drafts to the platform, or `update_draft_requirement` to edit one.",
  };
}
