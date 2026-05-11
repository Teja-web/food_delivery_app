import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { interviewScorecardAnalyzerPrompt } from "../prompts/interview-scorecard-analyzer";

export const interviewScorecardAnalysisSchema = z.object({
  alignmentByCompetency: z.array(z.object({
    competency: z.string().describe("Competency area evaluated."),
    score: z.number().min(0).max(100).describe("Competency score 0-100."),
    evidence: z.string().describe("Supporting evidence from scorecards."),
    panelAgreement: z.enum(["unanimous", "majority", "split"]).describe("Level of agreement among reviewers on this competency."),
  })).describe("Per-competency alignment from combined scorecards."),
  evidenceCoverage: z.number().min(0).max(1).describe("Fraction of target competencies covered by evidence (0-1)."),
  assessmentParagraph: z.string().describe("Synthesized 2-3 sentence factual summary of interview performance based on scorecard evidence. Do NOT make hiring recommendations — that is handled downstream."),
  panelHealth: z.enum(["complete", "partial", "insufficient"]).describe("Panel completeness based on expected vs submitted scorecards."),
  consensus: z.string().describe("Brief summary of panel alignment — where reviewers agree and disagree."),
  redFlags: z.array(z.string()).describe("Concerns identified across scorecards — disagreements, low scores, missing evidence."),
  standoutMoments: z.array(z.string()).describe("Highlights from scorecards — exceptional ratings, strong evidence, unanimous praise."),
});

export const interviewScorecardAnalyzerAgent = {
  slug: "interview-scorecard-analyzer" as const,
  name: "Interview Scorecard Analyzer",
  description: "Analyzes and aggregates scorecards from an interview panel into competency alignment and assessment.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.1,
  functionId: "interview-synthesis",
  systemPrompt: interviewScorecardAnalyzerPrompt,
  outputSchema: interviewScorecardAnalysisSchema,
};
