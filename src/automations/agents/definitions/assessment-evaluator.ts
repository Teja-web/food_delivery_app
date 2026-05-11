import { z } from "zod/v4";
import { DEFAULT_MODEL, type Agent } from "@/lib/ai";
import { assessmentEvaluatorPrompt } from "../prompts/assessment-evaluator";

export const RATING_VALUES = ["excellent", "good", "adequate", "poor", "missing"] as const;
export type Rating = (typeof RATING_VALUES)[number];

export const assessmentEvaluationSchema = z.object({
  rating: z.enum(RATING_VALUES).describe(
    "Overall rating bucket. 'missing' = no answer/empty/gibberish, 'poor' = minimal attempt, 'adequate' = meets minimum expectations, 'good' = exceeds expectations, 'excellent' = demonstrates mastery"
  ),
  strengths: z.string().describe("Specific strengths demonstrated"),
  weaknesses: z.string().describe("Specific areas for improvement"),
});

export const assessmentEvaluatorAgent: Agent = {
  slug: "assessment-evaluator",
  name: "Assessment Evaluator",
  description: "Evaluates candidate answers using rubric-profile-aware per-criterion scoring.",
  category: "system_readonly",
  model: DEFAULT_MODEL,
  temperature: 0,
  functionId: "assessment-evaluation",
  systemPrompt: assessmentEvaluatorPrompt,
};
