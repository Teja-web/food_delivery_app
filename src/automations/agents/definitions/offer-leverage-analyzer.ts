import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { offerLeverageAnalyzerPrompt } from "../prompts/offer-leverage-analyzer";

export const offerLeverageAnalysisSchema = z.object({
  leverageScore: z.number().min(0).max(100).describe("Candidate leverage score 0-100. Higher = candidate has more negotiation power."),
  leverageFactors: z.array(z.object({
    factor: z.string().describe("Factor name (e.g. 'Competing offers', 'Interview performance', 'Pipeline scarcity')."),
    signal: z.string().describe("What we know about this factor."),
    impact: z.enum(["increases", "decreases"]).describe("Whether this factor increases or decreases candidate leverage."),
  })).describe("Factors contributing to the leverage assessment."),
  negotiationStrategy: z.enum(["aggressive_open", "market_rate", "premium_required"]).describe(
    "aggressive_open = candidate has low leverage, open with a competitive but modest offer. " +
    "market_rate = balanced leverage, offer at market. " +
    "premium_required = candidate has high leverage, must offer above-market to close."
  ),
  closeProbability: z.number().min(0).max(100).describe("Estimated probability of closing this candidate at market rate. 0-100."),
});

export const offerLeverageAnalyzerAgent = {
  slug: "offer-leverage-analyzer" as const,
  name: "Offer Leverage Analyzer",
  description: "Assesses candidate negotiation leverage based on competing offers, interview performance, role urgency, and pipeline depth.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.3,
  functionId: "offer-leverage-analysis",
  systemPrompt: offerLeverageAnalyzerPrompt,
  outputSchema: offerLeverageAnalysisSchema,
};
