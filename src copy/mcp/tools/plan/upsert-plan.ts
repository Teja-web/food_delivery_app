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

import { CozntClient } from "../../client";
import { bumpToolCall, getSessionProject } from "../../session";
import { PLAN_KINDS, type PlanKind } from "../../../db/schema/plan/plan-kinds";
import { parseShortSyntax } from "../../../domain/short-syntax/parser";

export const upsertPlanInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
  kind: z
    .enum(PLAN_KINDS)
    .optional()
    .describe(
      "Plan kind. Picks the document type: `test_plan` for a test plan, `release_plan` for release notes, `storyboard` for a UI storyboard, etc. May also be derived from `shortSyntax` (`#kind`).",
    ),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/)
    .describe(
      "Stable identifier within the project — used to upsert. Lowercase alphanumerics + hyphens, e.g. `test-plan-q3-2026`.",
    ),
  title: z
    .string()
    .optional()
    .describe(
      "Human-readable title. May also be derived from `shortSyntax` (the leftover prose after stripping tokens).",
    ),
  summary: z.string().optional().describe("One-line summary shown in lists."),
  body: z.string().min(1).describe("Full markdown body. Treated as the new live content on revise."),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional kind-specific structured fields stored on project_tasks.metadata."),
  parentPlanId: z
    .string()
    .optional()
    .nullable()
    .describe("Optional rollup parent (e.g. a feature for a test_plan)."),
  changeNote: z
    .string()
    .optional()
    .describe("Optional note attached to this revision (e.g. 'regenerated after requirements update')."),
  shortSyntax: z
    .string()
    .optional()
    .describe(
      "Speed-of-thought authoring shorthand. Tokens: `#kind`, `+project-slug`, `@assignee` (or `@YYYY-MM-DD` for due date), `→approval:<target>`, `2h`/`3d`/`30m` estimate. Leftover prose becomes the title. Explicit fields (kind, title) win when both are provided.",
    ),
});

export type UpsertPlanInput = z.infer<typeof upsertPlanInput>;

export async function runUpsertPlan(client: CozntClient, input: UpsertPlanInput) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (!projectId) {
    throw new Error("No active project. API key resolution failed — verify COZNT_API_KEY is valid, or pass `projectId` explicitly.");
  }

  // Merge short-syntax tokens into structured fields when shortSyntax is
  // provided. Explicit fields always win — short-syntax fills gaps.
  let kind = input.kind;
  let title = input.title;
  if (input.shortSyntax) {
    const parsed = parseShortSyntax(input.shortSyntax);
    if (!kind && parsed.kind && PLAN_KINDS.includes(parsed.kind as PlanKind)) {
      kind = parsed.kind as PlanKind;
    }
    if (!title && parsed.title) title = parsed.title;
  }

  if (!kind) {
    throw new Error("kind is required — pass `kind` explicitly or include `#kind` in shortSyntax.");
  }
  if (!title) {
    throw new Error("title is required — pass `title` explicitly or include prose in shortSyntax.");
  }

  // Drop shortSyntax from the wire payload — server takes structured fields.
  const { shortSyntax: _drop, ...rest } = input;
  return client.post<unknown>(`/api/v1/mcp/plans`, { ...rest, projectId, kind, title });
}
