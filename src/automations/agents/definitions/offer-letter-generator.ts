import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { offerLetterGeneratorPrompt } from "../prompts/offer-letter-generator";

const compComponent = z.object({
  name: z.string().describe("Component name matching the input format."),
  amount: z.number().describe("Annual amount for this component."),
});

export const generatedOfferSchema = z.object({
  components: z.array(compComponent).describe("Recommended compensation breakdown matching the input format."),
  totalFixed: z.number().describe("Total fixed compensation (sum of all components)."),
  totalCtc: z.number().describe("Total CTC including bonus."),
  bonus: z.number().nullable().describe("Recommended annual bonus/variable pay."),
  equity: z.string().nullable().describe("Equity recommendation if applicable (e.g. '500 RSUs over 4 years')."),
  currency: z.string().describe("Currency code."),
  hikePercentage: z.number().describe("Percentage increase over current total CTC."),
  hikeAbsolute: z.number().describe("Absolute increase over current total CTC."),
  competitivePosition: z.enum(["below-band", "at-band", "above-band"]).describe("Where this offer sits relative to the role's compensation band."),
  negotiationFloor: z.number().describe("Minimum acceptable total CTC if candidate negotiates down."),
  negotiationCeiling: z.number().describe("Maximum total CTC if candidate negotiates up."),
  rationale: z.string().describe("Explanation of how the offer was calibrated, referencing current comp, role band, and market positioning."),
  bandCompliance: z.enum(["within", "stretched", "out-of-band"]).describe("Whether the recommended CTC is within the role band (within), within 10% of band edges (stretched), or outside the band entirely (out-of-band)."),
  parityRisk: z.enum(["low", "medium", "high"]).describe("Risk of internal pay equity issues. High if offer significantly exceeds the band midpoint or is below the candidate's current CTC."),
  guardrailWarnings: z.array(z.string()).describe("List of human-readable warnings about this offer. Examples: 'Offer exceeds band max by 12%', 'Below candidate current CTC', 'Hike below 10% — high decline risk'."),
});

export const offerLetterGeneratorAgent = {
  slug: "offer-letter-generator" as const,
  name: "Offer Letter Generator",
  description: "Generates a competitive offer recommendation based on current compensation and role band.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.3,
  functionId: "offer-letter-generation",
  systemPrompt: offerLetterGeneratorPrompt,
  outputSchema: generatedOfferSchema,
};
