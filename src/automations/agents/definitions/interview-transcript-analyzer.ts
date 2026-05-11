import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { interviewTranscriptAnalyzerPrompt } from "../prompts/interview-transcript-analyzer";

export const transcriptAnalysisSchema = z.object({
  topicsDiscussed: z.array(z.string()).describe("Key topics and themes covered during the interview."),
  competencyScores: z.array(z.object({
    competency: z.string().describe("The target competency being evaluated — must match one of the provided target competencies."),
    score: z.number().min(0).max(10).describe("Score 0-10 based on transcript evidence for this competency."),
    evidence: z.string().describe("Specific examples from the transcript supporting the score."),
  })).describe("Per-competency scores deduced from transcript analysis. One entry per target competency provided."),
  keyInsights: z.array(z.string()).describe("Notable observations about the candidate's performance, strengths, or concerns."),
  redFlags: z.array(z.string()).describe("Concerns surfaced during the interview — vague answers, avoidance, inconsistencies, attitude issues."),
  standoutMoments: z.array(z.string()).describe("Impressive moments — strong examples, deep expertise, thoughtful questions, creative problem-solving."),
});

export type TranscriptAnalysisOutput = z.infer<typeof transcriptAnalysisSchema>;

export const interviewTranscriptAnalyzerAgent = {
  slug: "interview-transcript-analyzer" as const,
  name: "Interview Transcript Analyzer",
  description: "Analyzes raw interview transcripts for engagement, depth, communication quality, and key insights.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.1,
  functionId: "interview-transcript-analysis",
  systemPrompt: interviewTranscriptAnalyzerPrompt,
  outputSchema: transcriptAnalysisSchema,
};
