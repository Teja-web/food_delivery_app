import { z } from "zod/v4";
import { SMALL_MODEL } from "@/lib/ai";
import { payStubExtractorPrompt } from "../prompts/pay-stub-extractor";

const compComponent = z.object({
  name: z.string().describe("Component name (e.g. Basic Salary, HRA, PF Deduction)."),
  amount: z.number().describe("Monthly amount for this component."),
});

export const payStubExtractionSchema = z.object({
  month: z.string().nullable().describe("Pay period month/year (e.g. March 2024)."),
  grossEarnings: z.number().nullable().describe("Total gross earnings for the month."),
  totalDeductions: z.number().nullable().describe("Total deductions for the month."),
  netPay: z.number().nullable().describe("Net take-home pay for the month."),
  earnings: z.array(compComponent).describe("Individual earning components with monthly amounts."),
  deductions: z.array(compComponent).describe("Individual deduction components with monthly amounts."),
  currency: z.string().nullable().describe("Currency code (INR, USD, EUR, etc)."),
});

export const payStubExtractorAgent = {
  slug: "pay-stub-extractor" as const,
  name: "Pay Stub Extractor",
  description: "Extracts structured earnings and deductions from pay stub text.",
  category: "system_readonly" as const,
  model: SMALL_MODEL,
  temperature: 0.1,
  functionId: "pay-stub-extraction",
  systemPrompt: payStubExtractorPrompt,
  outputSchema: payStubExtractionSchema,
};
