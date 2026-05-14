/**
 * MCP tool: upsert_plan
 *
 * File an authored markdown document as a plan. The canonical way for an
 * agent to land its output after running a generator skill (e.g. the
 * test-plan-generator, release-notes-generator). Upserts by
 * `(projectId, kind, slug)` — a new plan on first call, a `plan_revisions`
 * row on subsequent calls with the same key.
 *
 * Coznt's analog of SDLC's `upload_document`. Plans ARE coznt's document
 * container — kind discriminates the document type.
 */

import { z } from "zod";

import { CozntClient } from "../client.js";
import { bumpToolCall, getSessionProject } from "../session.js";
import { PLAN_KINDS } from "../../db/schema/plan.js";

export const upsertPlanInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
  kind: z
    .enum(PLAN_KINDS)
    .describe(
      "Plan kind. Picks the document type: `test_plan` for a test plan, `release_plan` for release notes, `storyboard` for a UI storyboard, etc.",
    ),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/)
    .describe(
      "Stable identifier within the project — used to upsert. Lowercase alphanumerics + hyphens, e.g. `test-plan-q3-2026`.",
    ),
  title: z.string().min(1).describe("Human-readable title."),
  summary: z.string().optional().describe("One-line summary shown in lists."),
  body: z.string().min(1).describe("Full markdown body. Treated as the new live content on revise."),
  details: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional kind-specific structured fields (validated downstream per kind)."),
  parentPlanId: z
    .string()
    .optional()
    .nullable()
    .describe("Optional rollup parent (e.g. a feature for a test_plan)."),
  changeNote: z
    .string()
    .optional()
    .describe("Optional note attached to this revision (e.g. 'regenerated after requirements update')."),
});

export type UpsertPlanInput = z.infer<typeof upsertPlanInput>;

export async function runUpsertPlan(client: CozntClient, input: UpsertPlanInput) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (!projectId) {
    throw new Error("No active project. Call `set_project` first, or pass `projectId`.");
  }
  return client.post<unknown>(`/api/v1/mcp/plans`, { ...input, projectId });
}
