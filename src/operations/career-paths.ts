/**
 * Career-path explorer — runs the LLM agent against a student's profile.
 * No DB caching for v1; regenerated on each /explore visit. Acceptable
 * while the surface is small; add caching when traffic justifies it.
 *
 * (candidate-portal-plan Phase 3.)
 */

import { generate } from "@/lib/ai";
import {
  careerPathExplorerAgent,
  careerPathExplorerSchema,
  type CareerPathExplorerOutput,
} from "@/automations/agents/definitions/career-path-explorer";
import type { StudentProfile } from "@/domain/portal/student-profile";

export interface CareerPathInput {
  candidateName: string;
  studentProfile: Partial<StudentProfile> | null;
  // Spillover signals from the candidate row that aren't on studentProfile
  legacySkills?: string[];
  legacyTitle?: string | null;
  legacyResumeText?: string | null;
}

export async function generateCareerPaths(
  input: CareerPathInput,
): Promise<CareerPathExplorerOutput | null> {
  const profileBlock = formatProfile(input);

  // Bail early if we don't have anything meaningful to ground on. Returning
  // null lets the page render an empty state rather than burning a tokens
  // call on a profile of nothing.
  if (!profileBlock.trim()) return null;

  const prompt = `${careerPathExplorerAgent.systemPrompt}\n\n## CANDIDATE: ${input.candidateName}\n\n${profileBlock}`;

  try {
    const result = await generate({
      agent: careerPathExplorerAgent,
      prompt,
      output: careerPathExplorerSchema,
    });
    return (result as any).object as CareerPathExplorerOutput;
  } catch {
    return null;
  }
}

function formatProfile(input: CareerPathInput): string {
  const lines: string[] = [];
  const sp = input.studentProfile;
  if (sp) {
    if (sp.institution || sp.degree || sp.major) {
      const ed = [
        sp.degree && sp.major && `${sp.degree} in ${sp.major}`,
        sp.institution && `at ${sp.institution}`,
        sp.expectedGraduation && `(graduating ${sp.expectedGraduation})`,
      ]
        .filter(Boolean)
        .join(" ");
      if (ed) lines.push(`Education: ${ed}`);
    }
    if (sp.gpa) {
      lines.push(`GPA: ${sp.gpa.value}/${sp.gpa.scale}`);
    }
    if (sp.coursework?.length) {
      lines.push(`Coursework: ${sp.coursework.join(", ")}`);
    }
    if (sp.projects?.length) {
      lines.push("Projects:");
      for (const p of sp.projects) {
        lines.push(
          `- ${p.title} (${p.role}): ${p.description}${
            p.tech?.length ? ` [${p.tech.join(", ")}]` : ""
          }`,
        );
      }
    }
    if (sp.internships?.length) {
      lines.push("Internships:");
      for (const i of sp.internships) {
        lines.push(`- ${i.role} at ${i.org} (${i.period}): ${i.summary ?? ""}`);
      }
    }
    if (sp.clubs?.length) lines.push(`Clubs: ${sp.clubs.join(", ")}`);
    if (sp.certifications?.length) {
      lines.push(`Certifications: ${sp.certifications.join(", ")}`);
    }
    if (sp.targetFunctions?.length) {
      lines.push(`Target functions: ${sp.targetFunctions.join(", ")}`);
    }
    if (sp.targetLocations?.length) {
      lines.push(`Target locations: ${sp.targetLocations.join(", ")}`);
    }
    if (sp.workAuthorization?.length) {
      lines.push(`Work authorization: ${sp.workAuthorization.join(", ")}`);
    }
  }

  // Legacy / professional fields fall through to the LLM as additional context.
  if (input.legacySkills?.length) {
    lines.push(`Self-claimed skills: ${input.legacySkills.join(", ")}`);
  }
  if (input.legacyTitle) lines.push(`Recent title: ${input.legacyTitle}`);
  if (input.legacyResumeText) {
    lines.push(`Resume excerpt:\n${input.legacyResumeText.slice(0, 1500)}`);
  }

  return lines.join("\n");
}
