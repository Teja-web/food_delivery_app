import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { careerPathExplorerPrompt } from "../prompts/career-path-explorer";

/**
 * Output for the /explore page. Returns a ranked list of career paths
 * personalized to the student's current profile + stated targets.
 *
 * Dynamic: regenerated when the underlying profile changes. No curated
 * seed table — the LLM is the source of truth, with the student's own
 * data as the prior. (candidate-portal-plan Phase 3.)
 */
export const careerPathExplorerSchema = z.object({
  paths: z
    .array(
      z.object({
        title: z.string().describe("Concrete role title (e.g. 'Software Engineer Intern (ML)')."),
        function: z.string().describe("Function bucket — swe, ml_ai, data, pm, design, etc."),
        kind: z
          .enum(["internship", "new_grad", "apprenticeship", "full_time"])
          .describe("Role kind this path targets."),
        matchScore: z
          .number()
          .min(0)
          .max(100)
          .describe("How well the student's current profile aligns (0-100)."),
        whyItFits: z
          .string()
          .describe(
            "1-2 sentences citing specific student artifacts (project / coursework / internship) that align with this path.",
          ),
        gaps: z
          .array(
            z.object({
              skill: z.string(),
              severity: z.enum(["minor", "moderate", "significant"]),
            }),
          )
          .describe("Concrete gaps for this path. Empty array if none."),
        growthActions: z
          .array(z.string())
          .describe(
            "2-4 specific, time-boxed actions (e.g. 'Build one ML project deploying a model end-to-end' — not 'Learn ML').",
          ),
        timeline: z
          .string()
          .describe(
            "Realistic timeline to be competitive given current state — '3-6 months', '1 internship cycle', etc.",
          ),
      }),
    )
    .min(3)
    .max(8)
    .describe("3-8 ranked paths, highest matchScore first."),
  summary: z
    .string()
    .describe(
      "1-2 sentences framing the recommendations — 'Your strongest signal is X; Y is the highest-leverage gap.'",
    ),
});

export type CareerPathExplorerOutput = typeof careerPathExplorerSchema._output;

export const careerPathExplorerAgent = {
  slug: "career-path-explorer" as const,
  name: "Career Path Explorer",
  description:
    "Generates personalized career-path suggestions for student / early-career candidates based on their profile + stated targets.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.3,
  functionId: "career-path-explorer",
  systemPrompt: careerPathExplorerPrompt,
  outputSchema: careerPathExplorerSchema,
};
