import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { orgIdentityExtractorPrompt } from "../prompts/org-identity-extractor";

export const orgIdentitySchema = z.object({
  values: z.array(z.string()).describe("Core company values — concise phrases, not sentences"),
  culturalSignals: z.array(z.string()).describe("Observable cultural traits — how people actually work and interact"),
  hiringPrinciples: z.array(z.string()).describe("Guiding principles for hiring decisions — what matters beyond skills"),
  behavioralExpectations: z.array(z.string()).describe("Behaviors that are expected and rewarded"),
  redFlags: z.array(z.string()).describe("Traits or behaviors that indicate poor fit"),
  summary: z.string().describe("2-3 sentence synthesis of who this organization is and what they stand for"),
});

export const orgIdentityExtractorAgent = {
  slug: "org-identity-extractor" as const,
  name: "Org Identity Extractor",
  description: "Extracts structured organizational identity from free-text descriptions and uploaded documents.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.3,
  functionId: "org-identity-extraction",
  systemPrompt: orgIdentityExtractorPrompt,
  outputSchema: orgIdentitySchema,
};
