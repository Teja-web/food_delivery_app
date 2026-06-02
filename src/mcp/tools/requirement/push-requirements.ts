/**
 * MCP tool: push_requirements
 *
 * Commit requirement-like plans to the platform. Two modes:
 *
 *   - Inline:   pass `items` — up to 50 plans, created in order.
 *   - Drafts:   omit `items` — pushes every requirement from the
 *               session's local drafts, then clears them.
 *
 * Mode is selected by whether `items` is present. SDLC's
 * `push_requirements` is drafts-only; the inline mode is a
 * coznt-specific simplification that survives if the agent didn't
 * use the draft_* family.
 */

import { z } from "zod";

import { CozntClient } from "../../client.js";
import { bumpToolCall, clearDrafts, getSessionProject, listDrafts } from "../../session.js";

const itemSchema = z.object({
  kind: z
    .enum(["epic", "feature", "story", "adr", "test_plan", "release_plan", "incident"])
    .optional(),
  title: z.string().min(1),
  summary: z.string().optional(),
  body: z.string().optional(),
  priority: z.enum(["p0", "p1", "p2", "p3"]).optional(),
  effortEstimate: z.string().optional(),
  parentPlanId: z.string().optional().nullable(),
  assigneeId: z.string().optional(),
  assigneeName: z.string().optional(),
});

export const pushRequirementsInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
  items: z
    .array(itemSchema)
    .min(1)
    .max(50)
    .optional()
    .describe(
      "Inline items to create (1-50). Omit to push the session's draft_requirement set instead.",
    ),
});

export type PushRequirementsInput = z.infer<typeof pushRequirementsInput>;

export async function runPushRequirements(
  client: CozntClient,
  input: PushRequirementsInput,
) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (!projectId) {
    throw new Error("No active project. API key resolution failed — verify COZNT_API_KEY is valid, or pass `projectId` explicitly.");
  }

  let payload: Array<Record<string, unknown>>;
  let pushedDrafts = false;

  if (input.items && input.items.length > 0) {
    payload = input.items;
  } else {
    const drafts = listDrafts();
    if (drafts.length === 0) {
      throw new Error(
        "No `items` passed and no session drafts to push. Use `draft_requirement` to compose drafts, or pass `items` inline.",
      );
    }
    // Strip the local-only fields (id / createdAt / updatedAt) before pushing.
    payload = drafts.map(({ id: _id, createdAt: _c, updatedAt: _u, ...rest }) => {
      void _id;
      void _c;
      void _u;
      return rest;
    });
    pushedDrafts = true;
  }

  const result = await client.post<unknown>(
    `/api/v1/mcp/projects/${encodeURIComponent(projectId)}/requirements`,
    payload,
  );
  if (pushedDrafts) clearDrafts();
  return { ...((result as object) ?? {}), pushedDrafts };
}
