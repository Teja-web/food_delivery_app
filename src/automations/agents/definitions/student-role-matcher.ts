import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { studentRoleMatcherPrompt } from "../prompts/student-role-matcher";

/**
 * LLM output schema for student/early-career role fit.
 *
 * Shares the per-criterion strength bucket with the professional matcher so
 * `computeMatchScore` works unchanged downstream — no parallel scoring path.
 * Adds an optional `growthPath` field: a short, specific learning/building
 * plan that a student would care about ("Build one ML project deploying a
 * model end-to-end and earn a Coursera ML certification.").
 */
export const studentRoleMatchSchema = z.object({
  alignment: z
    .array(
      z.object({
        criterion: z
          .string()
          .describe("Role criterion being evaluated."),
        strength: z
          .enum(["strong", "moderate", "weak", "none"])
          .describe(
            "How well the student demonstrates fit: strong (multiple projects/coursework/internships pointing this way), moderate (one or two relevant signals), weak (tangential), none (no evidence).",
          ),
        evidence: z
          .string()
          .describe(
            "Specific student-side evidence: project name, coursework module, internship task, club role. Avoid generic claims.",
          ),
        sources: z
          .array(z.enum(["projects", "coursework", "internships", "gpa", "certifications", "clubs"]))
          .describe("Which student profile fields informed this assessment."),
      }),
    )
    .describe("Per-criterion breakdown."),
  signal: z
    .string()
    .describe(
      "One sentence connecting a specific student artifact (project, internship, course) to a specific role requirement.",
    ),
  gaps: z
    .array(z.string())
    .describe("Concrete gaps. Each item is one specific concern with the student's portfolio."),
  growthPath: z
    .string()
    .describe(
      "1-2 sentences: the most leveraged thing the student could do in 4-6 weeks to be more competitive for this role.",
    ),
  summary: z
    .string()
    .describe(
      "2-3 sentences: verdict, strongest student-side evidence, biggest gap, and whether to advance now or after growthPath actions.",
    ),
});

export const studentRoleMatcherAgent = {
  slug: "student-role-matcher" as const,
  name: "Student-Role Matcher",
  description:
    "Evaluates student / early-career candidate fit against a role using projects, coursework, internships, and clubs as evidence.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.2,
  functionId: "student-role-match",
  systemPrompt: studentRoleMatcherPrompt,
  outputSchema: studentRoleMatchSchema,
};
