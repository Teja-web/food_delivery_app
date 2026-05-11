import { z } from "zod/v4";
import { SMALL_MODEL } from "@/lib/ai";
import { offerLetterExtractorPrompt } from "../prompts/offer-letter-extractor";

const compComponent = z.object({
  name: z.string().describe("Component name (e.g. Basic Salary, HRA, Transport Allowance)."),
  amount: z.number().describe("Annual amount in the local currency."),
});

export const offerLetterExtractionSchema = z.object({
  bandLevel: z.string().nullable().describe("Band/level designation if present (e.g. Band 3 Level C)."),
  designation: z.string().nullable().describe("Job title/designation from the offer."),
  components: z.array(compComponent).describe("All salary/compensation components with annual amounts."),
  variableBonus: z.number().nullable().describe("Annual variable/performance bonus amount, null if not mentioned."),
  fixedCtc: z.number().nullable().describe("Total fixed compensation (all components except variable bonus)."),
  totalCtc: z.number().nullable().describe("Total CTC including variable bonus."),
  currency: z.string().nullable().describe("Currency code (INR, USD, EUR, GBP, etc)."),
  format: z.enum(["indian-ctc", "us-salary", "other"]).describe("Detected compensation format."),
});

export const offerLetterExtractorAgent = {
  slug: "offer-letter-extractor" as const,
  name: "Offer Letter Extractor",
  description: "Extracts structured compensation data from offer letter text.",
  category: "system_readonly" as const,
  model: SMALL_MODEL,
  temperature: 0.1,
  functionId: "offer-letter-extraction",
  systemPrompt: offerLetterExtractorPrompt,
  outputSchema: offerLetterExtractionSchema,
};
