import { z } from "zod/v4";
import { DEFAULT_MODEL, type Agent } from "@/lib/ai";
import { personalityAnalyzerPrompt } from "../prompts/assessment-personality-analyzer";

export const personalityTraitSchema = z.object({
  traits: z.array(z.object({
    name: z.string().describe("Trait/dimension name (e.g., Openness, Dominance, Extraversion)"),
    score: z.number().min(0).max(100).describe("Dimension score 0-100"),
    evidence: z.string().describe("Brief evidence from candidate answers"),
  })),
  narrative: z.string().describe("2-3 sentence personality profile summary"),
  framework: z.enum(["big_five", "disc", "mbti"]).describe("Framework used for analysis"),
  typeCode: z.string().nullable().describe("Type code when applicable: 4-letter MBTI type (e.g. INTJ) or DISC primary/secondary (e.g. Di, SC). Null if not applicable."),
});

export const personalityAnalyzerAgent: Agent = {
  slug: "personality-analyzer",
  name: "Personality Analyzer",
  description: "Extracts personality trait indicators from candidate assessment responses.",
  category: "system_readonly",
  model: DEFAULT_MODEL,
  temperature: 0.2,
  functionId: "personality-analysis",
  systemPrompt: personalityAnalyzerPrompt,
};
