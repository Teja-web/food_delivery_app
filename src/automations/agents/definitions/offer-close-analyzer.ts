import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { offerCloseAnalyzerPrompt } from "../prompts/offer-close-analyzer";

export const offerCloseAnalysisSchema = z.object({
  risks: z.array(z.object({
    label: z.string().describe("Risk label."),
    value: z.string().describe("Risk description or current value."),
    severity: z.string().describe("One of: high, medium, low."),
  })).describe("Identified close risks."),
  checklist: z.array(z.object({
    label: z.string().describe("Checklist item."),
    done: z.boolean().describe("Whether item is complete."),
  })).describe("Offer close readiness checklist."),
  ownership: z.array(z.object({
    owner: z.string().describe("Person or role responsible."),
    task: z.string().describe("Action item description."),
  })).describe("Close ownership assignments."),
  recommendation: z.string().describe("Overall close recommendation narrative."),
  riskScore: z.number().min(0).max(100).describe("Composite risk score 0-100 (higher = riskier)."),
});

export const offerCloseAnalyzerAgent = {
  slug: "offer-close-analyzer" as const,
  name: "Offer Close Analyzer",
  description: "Analyzes close risk for an offer, producing risk factors, checklist, and ownership assignments.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.3,
  functionId: "offer-close-analysis",
  systemPrompt: offerCloseAnalyzerPrompt,
  outputSchema: offerCloseAnalysisSchema,
};
