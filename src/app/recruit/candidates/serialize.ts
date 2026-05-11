/**
 * Candidates list serialization — single source of truth for transforming
 * Drizzle query results into client-safe props.
 *
 * Types flow from: DB schema ($inferSelect) → serialize → client component.
 * No manual interfaces in the client — import from here.
 */

import type { Candidate } from "@/db/schema/candidates";

// -- Derived client types ------------------------------------------------

export interface SerializedCandidate {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  location: string | null;
  talentScore: number | null;
  source: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  activePipelines: number;
  activeRole: string | null;
  email: string;
  phone: string | null;
  skills: string[];
  tags: string[];
  yearsExperience: number | null;
  summary: string | null;
  experienceCount: number;
  educationCount: number;
  topExperience: { title: string; company: string } | null;
  topEducation: { institution: string; degree: string } | null;
  searchScore: number | null;
  /** Created within the last 7 days. */
  isNew: boolean;
}

export interface CandidateCounts {
  inPipeline: number;
  newThisWeek: number;
}

export interface CandidatesPageProps {
  candidates: SerializedCandidate[];
  total: number;
  counts: CandidateCounts;
}

// -- Pipeline info (provided by the caller) ------------------------------

interface PipelineInfo {
  count: number;
  roleName: string | null;
}

// -- Helpers -------------------------------------------------------------

function serializeDate(d: Date | string | null): string {
  if (!d) return "";
  return d instanceof Date ? d.toISOString() : String(d);
}

// -- Main serializer -----------------------------------------------------

const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function toMs(d: Date | string | null): number {
  if (!d) return 0;
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

export function serializeCandidatesList(
  candidates: Candidate[],
  pipelineMap: Record<string, PipelineInfo>,
  total: number,
): CandidatesPageProps {
  const now = Date.now();
  const items = candidates.map((c) => {
    const exp = c.experience ?? [];
    const edu = c.education ?? [];
    const createdAtMs = toMs(c.createdAt);
    const isNew = createdAtMs > 0 && now - createdAtMs < NEW_WINDOW_MS;
    return {
      id: c.id,
      name: c.name,
      title: c.title,
      company: c.company,
      location: c.location,
      talentScore: c.talentScore,
      source: c.source,
      status: c.status,
      createdAt: serializeDate(c.createdAt),
      updatedAt: serializeDate(c.updatedAt),
      activePipelines: pipelineMap[c.id]?.count ?? 0,
      activeRole: pipelineMap[c.id]?.roleName ?? null,
      email: c.email,
      phone: c.phone ?? null,
      skills: (c.skills ?? []).slice(0, 6),
      tags: (c.tags ?? []).slice(0, 4),
      yearsExperience: c.profile?.totalYearsExperience ?? null,
      summary: c.profile?.summary ?? null,
      experienceCount: exp.length,
      educationCount: edu.length,
      topExperience: exp[0] ? { title: exp[0].title, company: exp[0].company } : null,
      topEducation: edu[0] ? { institution: edu[0].institution, degree: edu[0].degree } : null,
      searchScore: (c as any)._score ?? null,
      isNew,
    } satisfies SerializedCandidate;
  });

  const counts: CandidateCounts = {
    inPipeline: items.filter((c) => c.activePipelines > 0).length,
    newThisWeek: items.filter((c) => c.isNew).length,
  };

  return { total, candidates: items, counts };
}
