import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { candidateTalentScorerPrompt } from "../prompts/candidate-talent-scorer";

/**
 * LLM output schema — subsignal scores on 0-4 anchor scale, weights tailored to candidate.
 * Pillar scores are computed in code from subsignals. Weights are snapped to nearest 5 for stability (fixes #18).
 */
export const talentAssessmentSchema = z.object({
  roleFamily: z.enum(["engineering", "management", "sales", "design", "operations", "other"]).describe("Detected role family"),
  pillars: z.array(z.object({
    pillar: z.string().describe("Pillar identifier (e.g. coreCompetency, missionResonance)"),
    importance: z.enum(["primary", "significant", "moderate", "minor"]).describe("How important this pillar is for THIS candidate given their role family and career stage. primary = defining pillar, minor = least relevant."),
    subsignals: z.array(z.object({
      label: z.string().describe("Subsignal name"),
      score: z.number().min(0).max(4).describe("Subsignal score on 0-4 anchor scale"),
      evidence: z.string().describe("Evidence supporting this score"),
    })).min(2).max(6).describe("2-6 subsignals with structured scores"),
    signals: z.array(z.string()).describe("2-6 subsignals as 'label: score/4 — evidence' (human-readable summary)"),
  })).min(6).max(7).describe("6 universal pillars, or 7 when org identity is provided (includes missionResonance)"),
  outlook: z.enum(["positive", "stable", "negative"]).describe("Career trajectory outlook"),
  confidence: z.enum(["high", "medium", "low"]).describe("Assessment confidence based on evidence quality"),
  gaps: z.array(z.string()).describe("Top 3 gaps as 'Pillar Name: validation question a recruiter should ask' — use Title Case for pillar names"),
});

/** Raw LLM output type (no weight/score — those are computed in code) */
export type TalentAssessmentLLMOutput = z.infer<typeof talentAssessmentSchema>;

/** Full assessment type after deterministic scoring is applied */
export interface TalentAssessment {
  roleFamily: string;
  pillars: Array<{
    pillar: string;
    weight: number;
    score: number;
    subsignals: Array<{ label: string; score: number; evidence: string }>;
    signals: string[];
  }>;
  outlook: "positive" | "stable" | "negative";
  confidence: "high" | "medium" | "low";
  gaps: string[];
}

export const candidateTalentScorerAgent = {
  slug: "candidate-talent-scorer" as const,
  name: "Candidate Talent Scorer",
  description: "Pillar-based talent assessment with evidence-gated subsignals, deterministic scoring, letter rating, outlook, confidence, and gap validation.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.1,
  functionId: "candidate-talent-assessment",
  systemPrompt: candidateTalentScorerPrompt,
  outputSchema: talentAssessmentSchema,
};
