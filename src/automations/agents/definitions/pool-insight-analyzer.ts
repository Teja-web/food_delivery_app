import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { poolInsightAnalyzerPrompt } from "../prompts/pool-insight-analyzer";

export const poolInsightAnalyzerSchema = z.object({
  criteria: z.object({
    skills: z.array(z.string()).describe("Key skills this pool targets, extracted from pool name and description."),
    locations: z.array(z.string()).describe("Geographic locations or regions this pool covers. Empty if global/unspecified."),
    experienceMin: z.number().nullable().describe("Minimum years of experience. Null if not specified."),
    experienceMax: z.number().nullable().describe("Maximum years of experience. Null if not specified."),
    tags: z.array(z.string()).describe("Additional tags describing the pool (e.g. 'enterprise', 'B2B', 'referral')."),
  }).describe("Structured criteria extracted from pool name and description."),
  matchingRoleIds: z.array(z.string()).describe("IDs of roles that match this pool's criteria. Empty if no matches."),
  topSignal: z.string().describe("One-sentence insight about the pool's health, performance, or actionable recommendation."),
  health: z.enum(["active", "growing", "stale"]).describe("Pool health status based on recent activity and candidate flow."),
});

export const poolInsightAnalyzerAgent = {
  slug: "pool-insight-analyzer" as const,
  name: "Pool Insight Analyzer",
  description: "Analyzes talent pool to extract criteria, match roles, and generate health insights.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.3,
  functionId: "pool-insight-analyzer",
  systemPrompt: poolInsightAnalyzerPrompt,
  outputSchema: poolInsightAnalyzerSchema,
};
