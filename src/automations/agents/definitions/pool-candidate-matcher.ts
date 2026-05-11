import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { poolCandidateMatcherPrompt } from "../prompts/pool-candidate-matcher";

export const poolCandidateMatcherSchema = z.object({
  matchingPools: z.array(z.object({
    poolId: z.string().describe("The pool ID being evaluated."),
    shouldAdd: z.boolean().describe("Whether the candidate should be added to this pool."),
    confidence: z.number().min(0).max(100).describe("Confidence score 0-100 for this match."),
    reasoning: z.string().describe("Brief explanation of why the candidate does or doesn't match."),
  })).describe("Evaluation results for each pool."),
});

export const poolCandidateMatcherAgent = {
  slug: "pool-candidate-matcher" as const,
  name: "Pool Candidate Matcher",
  description: "Evaluates whether a candidate matches pool criteria for auto-assignment.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.2,
  functionId: "pool-candidate-matcher",
  systemPrompt: poolCandidateMatcherPrompt,
  outputSchema: poolCandidateMatcherSchema,
};
