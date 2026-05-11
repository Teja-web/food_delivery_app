import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { candidateInterviewCoachPrompt } from "../prompts/candidate-interview-coach";

export const candidateInterviewCoachPracticeSchema = z.object({
  prepBriefing: z
    .string()
    .describe("2-3 sentence briefing for the candidate on what to expect in this interview"),
  questions: z
    .array(
      z.object({
        question: z
          .string()
          .describe("Practice question reframed for candidate self-prep"),
        category: z
          .string()
          .describe("Competency area being assessed"),
        hint: z
          .string()
          .describe(
            "What a strong answer includes — specific and actionable, e.g. 'describe a cross-functional project with measurable outcomes'",
          ),
        whyThisMatters: z
          .string()
          .describe(
            "Why the interviewer cares about this — helps the candidate understand what's being evaluated",
          ),
      }),
    )
    .min(5)
    .max(8),
});

export const candidateInterviewCoachRapidFireSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z
          .string()
          .describe("Short, direct question — no preamble, under 20 words"),
        category: z.string().describe("Competency area"),
      }),
    )
    .min(8)
    .max(12),
});

type CandidateInterviewCoachPracticeOutput = z.infer<typeof candidateInterviewCoachPracticeSchema>;
type CandidateInterviewCoachRapidFireOutput = z.infer<typeof candidateInterviewCoachRapidFireSchema>;

export const candidateInterviewCoachAgent = {
  slug: "candidate-interview-coach" as const,
  name: "Candidate Interview Coach",
  description:
    "Transforms an interviewer's prep plan into candidate-facing practice material with hints and guidance.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.3,
  systemPrompt: candidateInterviewCoachPrompt,
};
