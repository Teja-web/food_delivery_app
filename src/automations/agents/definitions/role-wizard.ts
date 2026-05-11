import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { roleWizardPrompt } from "../prompts/role-wizard";

export const roleWizardSchema = z.object({
  title: z.string().nullable().describe("Role title."),
  department: z.string().nullable().describe("Department (e.g. Engineering, Revenue, Product, Marketing, Operations)."),
  team: z.string().nullable().describe("Team within the department (e.g. Platform, Growth, Infrastructure). Null if not specified."),
  location: z.string().nullable().describe("Location including remote/hybrid/onsite."),
  headcount: z.number().int().positive().nullable().describe("Number of hires."),
  compensation: z.object({
    min: z.number().describe("Lower annual compensation in whole currency units (e.g. 90000)."),
    max: z.number().describe("Upper annual compensation in whole currency units (e.g. 120000)."),
    currency: z.string().nullable().describe("Currency code (e.g. USD, KES). Null if not specified."),
    equity: z.string().nullable().describe("Equity details if mentioned."),
    bonus: z.string().nullable().describe("Bonus details if mentioned."),
  }).nullable().describe("Compensation range. Extract from salary, pay, compensation, or package sections. Normalize to annual amounts in whole units."),
  employmentType: z.enum(["Full-time", "Contract", "Part-time"]).nullable().describe("Employment type."),
  businessCase: z.string().nullable().describe("Why this role exists — synthesize from the JD's intro, mission, team context, or 'about the role' section. Capture the business need this hire addresses."),
  description: z.string().nullable().describe("Core role description — synthesize responsibilities, day-to-day duties, and scope from the JD. Combine 'responsibilities', 'what you'll do', and similar sections."),
  competencies: z.array(z.object({
    name: z.string().describe("Competency name."),
    weight: z.enum(["required", "preferred", "nice_to_have"]).describe("Importance level."),
  })).nullable().describe("Competencies with weights. Null if not enough context to determine."),
  mustHaves: z.string().nullable().describe("Must-have requirements as newline-separated text."),
  niceToHaves: z.string().nullable().describe("Nice-to-have qualifications as newline-separated text."),
  interviewStages: z.array(z.object({
    name: z.string().describe("Stage name (e.g. Phone Screen, Technical Interview)."),
    interviewer: z.string().describe("Who should conduct this (e.g. Recruiter, Hiring Manager)."),
    durationMins: z.number().int().describe("Duration in minutes."),
    competencies: z.array(z.string()).describe("Competencies assessed in this stage."),
  })).nullable().describe("Interview stages. Null if not enough context to determine."),
});

export type RoleWizardOutput = z.infer<typeof roleWizardSchema>;

export const roleWizardAgent = {
  slug: "role-wizard" as const,
  name: "Role Wizard",
  description: "Assists with role creation — extracts from documents, generates criteria, and designs interview plans based on available context.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.3,
  functionId: "role-wizard",
  systemPrompt: roleWizardPrompt,
  outputSchema: roleWizardSchema,
};
