import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { engagementDrafterPrompt } from "../prompts/engagement-drafter";

export const engagementDraftSchema = z.object({
  subject: z.string().describe("Email subject line."),
  body: z.string().describe("Email body content."),
  tone: z.string().describe("One of: professional, casual, urgent, warm."),
  templateId: z.string().nullable().optional().describe("Template ID if based on an existing template."),
});

export const engagementDrafterAgent = {
  slug: "engagement-drafter" as const,
  name: "Engagement Drafter",
  description: "Drafts outreach and engagement communications for candidates.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.5,
  functionId: "engagement-draft",
  systemPrompt: engagementDrafterPrompt,
  outputSchema: engagementDraftSchema,
};
