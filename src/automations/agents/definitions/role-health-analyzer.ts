import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { roleHealthAnalyzerPrompt } from "../prompts/role-health-analyzer";

export const roleHealthAnalysisSchema = z.object({
  health: z.enum(["on-track", "at-risk", "stalled"]).describe("Computed health status based on pipeline reality."),
  headline: z.string().describe("One sentence explaining the health status. Shown on the roles list."),
  action: z.string().describe("One sentence: the single most important thing the recruiter should do right now."),
});

export const roleHealthAnalyzerAgent = {
  slug: "role-health-analyzer" as const,
  name: "Role Health Analyzer",
  description: "Assesses role health from pipeline reality and recommends the single next action.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.2,
  functionId: "role-health-analyzer",
  systemPrompt: roleHealthAnalyzerPrompt,
  outputSchema: roleHealthAnalysisSchema,
};
