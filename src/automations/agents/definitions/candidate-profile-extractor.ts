import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { candidateProfileExtractorPrompt } from "../prompts/candidate-profile-extractor";

export const candidateProfileSchema = z.object({
  summary: z.string().nullable().describe("2-3 sentence recruiter-facing summary. Null if insufficient information."),
  phone: z.string().nullable().describe("Phone number exactly as stated in the resume/profile (e.g. '+1 555-123-4567', '(555) 123-4567'). Null if not found."),
  location: z.string().nullable().describe("Location/address as stated (e.g. 'San Francisco, CA', 'New York, NY', 'Remote'). Include city and state/country. Null if not found."),
  skills: z.array(z.string()).describe("Categorized skills found in the resume. Empty array if none identified."),
  currentTitle: z.string().nullable().describe("Most recent job title exactly as stated. Null if not found."),
  currentCompany: z.string().nullable().describe("Most recent employer exactly as stated. Null if not found."),
  totalYearsExperience: z.number().nullable().describe("Total years of professional experience. Null if dates not available."),
  experience: z.array(z.object({
    title: z.string().describe("Job title."),
    company: z.string().describe("Employer name."),
    startDate: z.string().nullable().describe("Start date as stated (e.g. 'Jan 2020', '2019'). Null if not found."),
    endDate: z.string().nullable().describe("End date or 'Present'. Null if not found."),
    description: z.string().nullable().describe("Brief role summary, 1-2 sentences. Null if not enough detail."),
  })).describe("Work experience entries in reverse chronological order. Empty array if none found."),
  education: z.array(z.object({
    institution: z.string().describe("School or university name."),
    degree: z.string().describe("Degree type (e.g. 'BS', 'MBA', 'PhD')."),
    field: z.string().nullable().describe("Field of study. Null if not stated."),
    year: z.number().nullable().describe("Graduation year. Null if not stated."),
  })).describe("Education entries. Empty array if none found."),
  languages: z.array(z.string()).describe("Languages spoken. Empty array if none mentioned."),
  certifications: z.array(z.string()).describe("Professional certifications. Empty array if none mentioned."),
});

export const candidateProfileExtractorAgent = {
  slug: "candidate-profile-extractor" as const,
  name: "Candidate Profile Extractor",
  description: "Profile indexing and summary generation from resume and candidate data.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.1,
  functionId: "candidate-profile-extractor",
  systemPrompt: candidateProfileExtractorPrompt,
  outputSchema: candidateProfileSchema,
};
