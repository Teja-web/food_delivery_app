/**
 * change-risk-classifier — the first real AI agent in coznt (Milestone C).
 *
 * Pairs with the deterministic `classifyChangeRisk` heuristic in
 * `src/operations/change-risk.ts`. The heuristic gives a fast risk *bucket*
 * from line counts and path globs. This agent reads the same diff plus the
 * project's critical paths and active rules, and produces:
 *
 *   - a riskClass that the heuristic may have under- or over-called,
 *   - a one-paragraph rationale citing concrete signals, and
 *   - a recommendedGates list (test coverage, security review, etc.).
 *
 * The agent's output is written to `intelligence` (kind: `change-risk`) and
 * surfaces on the PR row in the cockpit / approvals inbox. The deterministic
 * gate decision does not block on this — the AI run is fire-and-forget so a
 * model outage never wedges the SDLC pipeline.
 */

import { z } from "zod/v4";
import { type Agent } from "@/lib/ai";
import { changeRiskClassifierPrompt } from "../prompts/change-risk-classifier";

export const changeRiskSchema = z.object({
  riskClass: z.enum(["low", "medium", "high", "critical"]),
  rationale: z
    .string()
    .min(20)
    .max(600)
    .describe("One paragraph (≤ 600 chars) citing the specific files, line counts, or paths driving the verdict."),
  signals: z
    .array(
      z.object({
        kind: z.string().describe("Short slug, e.g. `production-path`, `migration`, `large-diff`."),
        evidence: z.string().describe("Concrete reference — a file path, line count, or rule slug."),
      }),
    )
    .max(8),
  recommendedGates: z
    .array(z.string())
    .max(6)
    .describe("Short slugs of human checks to add before merge, e.g. `security-review`, `db-migration-walkthrough`."),
});

export type ChangeRiskClassification = z.infer<typeof changeRiskSchema>;

export const CHANGE_RISK_CLASSIFIER_SLUG = "change-risk-classifier";

export const changeRiskClassifierAgent: Agent = {
  slug: CHANGE_RISK_CLASSIFIER_SLUG,
  name: "Change Risk Classifier",
  description: "Reads a PR diff + project critical paths and classifies merge risk with rationale.",
  category: "code-review",
  temperature: 0.2,
  systemPrompt: changeRiskClassifierPrompt,
  outputSchema: changeRiskSchema,
};
