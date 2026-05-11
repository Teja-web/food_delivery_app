import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { candidateComparerPrompt } from "../prompts/candidate-comparer";

export const candidateComparisonSchema = z.object({
  rankings: z.array(z.object({
    candidateId: z.string().describe("The candidate's ID."),
    rank: z.number().int().min(1).describe("Rank among compared candidates (1 = best)."),
    score: z.number().min(0).max(100).transform(Math.round).describe("Composite comparison score 0-100."),
    strengths: z.array(z.string()).describe("Top 2-3 differentiating strengths vs the other candidates."),
    concerns: z.array(z.string()).describe("Top 1-2 concerns relative to the other candidates."),
  })).describe("Candidates ranked from strongest to weakest fit."),
  criteriaComparison: z.array(z.object({
    criterion: z.string().describe("The criterion being compared."),
    bestCandidateId: z.string().describe("ID of the candidate who is strongest on this criterion."),
    summary: z.string().describe("One sentence comparing all candidates on this criterion."),
  })).describe("Per-criterion comparison highlighting who is best for each."),
  recommendation: z.string().describe("2-3 sentence overall recommendation. Name the top candidate, explain why, and note any close calls or trade-offs between candidates."),
});

export const candidateComparerAgent = {
  slug: "candidate-comparer" as const,
  name: "Candidate Comparer",
  description: "Compares multiple candidates for a role, synthesizing their evaluations into a ranked recommendation.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.1,
  functionId: "candidate-compare",
  systemPrompt: candidateComparerPrompt,
  outputSchema: candidateComparisonSchema,
};
