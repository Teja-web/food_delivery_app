/**
 * Student / early-career profile shape.
 *
 * Lives in `candidates.profile.studentProfile` (the existing JSON column).
 * Additive — does NOT replace the professional fields; both can coexist on
 * a candidate during a kind transition. UI surfaces the variant matching
 * `candidates.kind`.
 *
 * (candidate-portal-plan Phase 3; docs/phase-3-campus-spec.md.)
 */

import { z } from "zod/v4";

export const DEGREE_TYPES = [
  "high_school",
  "bachelors",
  "masters",
  "phd",
  "diploma",
  "bootcamp",
  "other",
] as const;
export type DegreeType = (typeof DEGREE_TYPES)[number];

const projectSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  url: z.string().url().optional().or(z.literal("")),
  role: z.string().min(1),
  tech: z.array(z.string()).default([]),
  duration: z.string().optional(),
  teammates: z.number().int().nonnegative().optional(),
});

const internshipSchema = z.object({
  org: z.string().min(1),
  role: z.string().min(1),
  period: z.string().min(1),
  summary: z.string().optional(),
});

export const studentProfileSchema = z.object({
  institution: z.string().min(1),
  /** ISO 3166-1 alpha-2. Lower- or upper-case accepted; stored uppercase. */
  institutionCountry: z
    .string()
    .length(2)
    .transform((s) => s.toUpperCase()),
  degree: z.enum(DEGREE_TYPES),
  major: z.string().min(1),
  /** YYYY-MM */
  expectedGraduation: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  gpa: z
    .object({
      value: z.number().nonnegative(),
      scale: z.number().positive(),
    })
    .optional(),
  coursework: z.array(z.string()).default([]),
  projects: z.array(projectSchema).default([]),
  internships: z.array(internshipSchema).default([]),
  clubs: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
  targetFunctions: z.array(z.string()).default([]),
  targetLocations: z.array(z.string()).default([]),
  /** ISO-2 country codes the student can legally work in. */
  workAuthorization: z.array(z.string()).default([]),
});

export type StudentProfile = z.infer<typeof studentProfileSchema>;

/**
 * Student-variant profile completeness. Different weighting from the
 * professional `profileCompleteness` — projects and internships matter more
 * than resume/title for students.
 *
 * Threshold to count as "has profile" stays at 50 (same as professional).
 */
export function studentProfileCompleteness(profile: Partial<StudentProfile> | null | undefined): {
  complete: number;
  total: number;
  percentage: number;
} {
  if (!profile) {
    return { complete: 0, total: 100, percentage: 0 };
  }

  let score = 0;
  if (profile.institution && profile.expectedGraduation) score += 15;
  if (profile.major) score += 10;
  if ((profile.projects?.length ?? 0) >= 2) score += 25;
  else if ((profile.projects?.length ?? 0) === 1) score += 12;
  if ((profile.coursework?.length ?? 0) >= 3) score += 10;
  if ((profile.internships?.length ?? 0) >= 1 || (profile.projects?.length ?? 0) >= 3) score += 20;
  if ((profile.targetFunctions?.length ?? 0) > 0) score += 10;
  if (profile.gpa) score += 10;

  return {
    complete: score,
    total: 100,
    percentage: Math.min(100, score),
  };
}
