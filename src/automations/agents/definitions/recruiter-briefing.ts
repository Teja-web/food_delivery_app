import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { recruiterBriefingPrompt } from "../prompts/recruiter-briefing";

export const recruiterBriefingSchema = z.object({
  briefing: z.string().describe("One short paragraph summarizing today's priorities across all roles. Name specific candidates and roles. No generic advice."),
});

export const recruiterBriefingAgent = {
  slug: "recruiter-briefing" as const,
  name: "Recruiter Briefing",
  description: "Generates a daily briefing paragraph for a recruiter from their triage items and role health.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.3,
  functionId: "recruiter-briefing",
  systemPrompt: recruiterBriefingPrompt,
  outputSchema: recruiterBriefingSchema,
};
