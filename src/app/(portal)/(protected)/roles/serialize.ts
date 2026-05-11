/**
 * Portal pipeline serialization — transforms match data into client-safe props.
 *
 * Uses the same alignment scoring logic as the recruiter-side serializer
 * (src/app/recruit/roles/[id]/serialize.ts) so both views show identical data.
 *
 * Types flow: matches table → serialize → PipelineClient component.
 */

import type { CriterionAlignment } from "@/db/schema/matches";

// -- Derived types ------------------------------------------------------

type CriterionRating = "strong" | "partial" | "gap";

export interface PortalAlignment {
  criterion: string;
  rating: CriterionRating;
  evidence?: string;
}

export interface PortalApplicationInterview {
  interviewId: string;
  candidateToken: string | null;
  scheduledAt: string | null;
  durationMins: number | null;
  status: string;
  meetingLink: string | null;
}

export interface PortalApplication {
  id: string;
  jobId: string;
  jobTitle: string;
  jobLocation: string;
  orgName: string | null;
  stage: string;
  fitScore: number | null;
  recommendation: string | null;
  alignment: PortalAlignment[];
  signal: string | null;
  gaps: string[];
  summary: string | null;
  interview: PortalApplicationInterview | null;
}

// -- Helpers (mirrored from recruiter serialize.ts) ---------------------

function scoreToRating(score: number): CriterionRating {
  if (score >= 75) return "strong";
  if (score >= 50) return "partial";
  return "gap";
}

function serializeAlignment(raw: CriterionAlignment[] | null | undefined): PortalAlignment[] {
  return (raw ?? []).map((a) => ({
    criterion: a.criterion,
    rating: scoreToRating(a.score),
    evidence: a.evidence,
  }));
}

// -- Main serializer ----------------------------------------------------

interface RawOpportunity {
  applicationId: string;
  jobId: string;
  stage: string | null;
  jobTitle: string | null;
  jobLocation: string | null;
  orgName: string | null;
  fitScore: number | null;
  recommendation: string | null;
  alignment: CriterionAlignment[] | null;
  signal: string | null;
  gaps: string[] | null;
  summary: string | null;
}

interface RawInterviewForApp {
  interviewId: string;
  applicationId: string;
  candidateToken: string | null;
  scheduledAt: Date | string | null;
  durationMins: number | null;
  status: string | null;
  meetingLink: string | null;
}

export function serializePortalApplications(
  rows: RawOpportunity[],
  interviews: RawInterviewForApp[] = [],
): PortalApplication[] {
  // Build lookup: applicationId → most relevant interview (upcoming confirmed > scheduled > any)
  const interviewByApp = new Map<string, RawInterviewForApp>();
  const now = new Date();
  for (const iv of interviews) {
    const existing = interviewByApp.get(iv.applicationId);
    if (!existing) {
      interviewByApp.set(iv.applicationId, iv);
    } else {
      // Prefer upcoming over past, confirmed over other statuses
      const ivDate = iv.scheduledAt ? new Date(iv.scheduledAt as unknown as string) : null;
      const exDate = existing.scheduledAt ? new Date(existing.scheduledAt as unknown as string) : null;
      const ivUpcoming = ivDate && ivDate > now;
      const exUpcoming = exDate && exDate > now;
      if (ivUpcoming && !exUpcoming) {
        interviewByApp.set(iv.applicationId, iv);
      }
    }
  }

  return rows.map((opp) => {
    const iv = interviewByApp.get(opp.applicationId);
    return {
      id: opp.applicationId,
      jobId: opp.jobId,
      jobTitle: opp.jobTitle ?? "Role",
      jobLocation: opp.jobLocation ?? "",
      orgName: opp.orgName ?? null,
      stage: opp.stage ?? "applied",
      fitScore: opp.fitScore ?? null,
      recommendation: opp.recommendation ?? null,
      alignment: serializeAlignment(opp.alignment),
      signal: opp.signal ?? null,
      gaps: opp.gaps ?? [],
      summary: opp.summary ?? null,
      interview: iv
        ? {
            interviewId: iv.interviewId,
            candidateToken: iv.candidateToken ?? null,
            scheduledAt: iv.scheduledAt ? new Date(iv.scheduledAt as unknown as string).toISOString() : null,
            durationMins: iv.durationMins ?? null,
            status: iv.status ?? "",
            meetingLink: iv.meetingLink ?? null,
          }
        : null,
    };
  });
}
