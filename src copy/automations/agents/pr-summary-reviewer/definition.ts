/**
 * PR summary reviewer - Coznt Cat V1.
 *
 * Produces a concise, structured summary from PR metadata and file patches.
 * The result is stored as intelligence; V1 does not write back to GitHub.
 */

import { z } from "zod/v4";
import { type Agent } from "@/lib/ai";
import { prSummaryReviewerPrompt } from "./prompt";

export const PR_SUMMARY_REVIEWER_SLUG = "coznt-cat-pr-summary";

export const prSummaryFileStatusSchema = z.enum([
  "added",
  "modified",
  "removed",
  "renamed",
  "changed",
]);

export const prSummaryReviewSchema = z.object({
  summary: z
    .string()
    .min(20)
    .max(1200)
    .describe("A concise summary of the PR's intent and main implementation changes."),
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(500),
        status: prSummaryFileStatusSchema,
        additions: z.number().int().nonnegative(),
        deletions: z.number().int().nonnegative(),
        changeSummary: z.string().min(5).max(500),
      }),
    )
    .max(80),
  notableChanges: z.array(z.string().min(5).max(300)).max(10),
});

export type PrSummaryReview = z.infer<typeof prSummaryReviewSchema>;
export type PrSummaryFileStatus = z.infer<typeof prSummaryFileStatusSchema>;

export const prSummaryReviewerAgent: Agent = {
  slug: PR_SUMMARY_REVIEWER_SLUG,
  name: "Coznt Cat PR Summary",
  description: "Summarizes pull requests from title, description, and file diffs.",
  category: "code-review",
  temperature: 0.2,
  systemPrompt: prSummaryReviewerPrompt,
  outputSchema: prSummaryReviewSchema,
};
