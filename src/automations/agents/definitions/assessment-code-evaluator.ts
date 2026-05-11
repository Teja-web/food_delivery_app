import { z } from "zod/v4";
import { DEFAULT_MODEL, type Agent } from "@/lib/ai";
import { codeEvaluatorPrompt } from "../prompts/assessment-code-evaluator";

import { RATING_VALUES } from "./assessment-evaluator";

export const codeEvaluationSchema = z.object({
  rating: z.enum(RATING_VALUES).describe(
    "Overall rating bucket. 'missing' = no answer/empty, 'poor' = fundamentally broken, 'adequate' = working with rough edges, 'good' = clean correct solution, 'excellent' = elegant and production-ready"
  ),
  strengths: z.string().describe("Specific coding strengths"),
  improvements: z.string().describe("Specific areas for improvement"),
});

export const codeEvaluatorAgent: Agent = {
  slug: "code-evaluator",
  name: "Code Evaluator",
  description: "Evaluates coding assessment submissions for correctness, quality, and best practices.",
  category: "system_readonly",
  model: DEFAULT_MODEL,
  temperature: 0,
  functionId: "code-evaluation",
  systemPrompt: codeEvaluatorPrompt,
};
