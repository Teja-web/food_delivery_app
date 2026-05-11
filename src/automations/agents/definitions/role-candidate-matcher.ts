import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { roleCandidateMatcherPrompt } from "../prompts/role-candidate-matcher";

/**
 * LLM output schema — qualitative judgments only.
 * Numeric scoring is computed deterministically in the match task (fixes #33).
 */
export const roleCandidateMatchSchema = z.object({
  alignment: z.array(z.object({
    criterion: z.string().describe("Role criterion being evaluated."),
    strength: z.enum(["strong", "moderate", "weak", "none"]).describe("How well the candidate meets this criterion: strong (clear, validated fit), moderate (partial fit or unvalidated claims), weak (minimal evidence), none (no evidence or contradicted by observed data)."),
    evidence: z.string().describe("Evidence supporting the assessment from candidate data."),
    sources: z.array(z.enum(["resume", "interview", "assessment", "talent_score"])).describe("Which evidence types informed this assessment."),
  })).describe("Array of objects — one per role criterion, each with criterion name, strength bucket, and evidence."),
  signal: z.string().describe("One sentence connecting the candidate's strongest experience to a specific role requirement. This is a match insight, NOT a resume summary."),
  gaps: z.array(z.string()).describe("Concrete gaps or risks. Each item is one specific concern. Empty array if none."),
  summary: z.string().describe("2-3 sentence recruiter-facing assessment. State the verdict, cite the strongest evidence, name the biggest concern, and suggest what to do next. Be direct and actionable."),
});

export const roleCandidateMatcherAgent = {
  slug: "role-candidate-matcher" as const,
  name: "Role-Candidate Matcher",
  description: "Evaluates candidate-role fit by scoring criteria alignment and computing a composite fit score.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.1,
  functionId: "role-candidate-match",
  systemPrompt: roleCandidateMatcherPrompt,
  outputSchema: roleCandidateMatchSchema,
};
