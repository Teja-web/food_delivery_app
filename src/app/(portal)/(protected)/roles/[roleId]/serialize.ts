import type { CriterionAlignment } from "@/db/schema/matches";

type CriterionRating = "strong" | "partial" | "gap";

export interface RoleDetailAlignment {
  criterion: string;
  rating: CriterionRating;
  evidence?: string;
}

export interface RoleDetailData {
  jobId: string;
  applicationId: string | null;
  stage: string | null;
  jobTitle: string;
  jobDescription: string | null;
  jobLocation: string | null;
  jobDepartment: string | null;
  jobEmploymentType: string | null;
  fitScore: number | null;
  recommendation: string | null;
  alignment: RoleDetailAlignment[];
  signal: string | null;
  gaps: string[];
  summary: string | null;
}

function scoreToRating(score: number): CriterionRating {
  if (score >= 75) return "strong";
  if (score >= 50) return "partial";
  return "gap";
}

function serializeAlignment(raw: CriterionAlignment[] | null | undefined): RoleDetailAlignment[] {
  return (raw ?? []).map((a) => ({
    criterion: a.criterion,
    rating: scoreToRating(a.score),
    evidence: a.evidence,
  }));
}

export function serializeRoleDetail(raw: {
  jobId: string;
  applicationId: string | null;
  stage: string | null;
  fitScore: number | null;
  recommendation: string | null;
  alignment: unknown;
  signal: string | null;
  gaps: string[] | null;
  summary: string | null;
  jobTitle: string | null;
  jobDescription: string | null;
  jobLocation: string | null;
  jobDepartment: string | null;
  jobEmploymentType: string | null;
}): RoleDetailData {
  return {
    jobId: raw.jobId,
    applicationId: raw.applicationId,
    stage: raw.stage,
    jobTitle: raw.jobTitle ?? "Role",
    jobDescription: raw.jobDescription,
    jobLocation: raw.jobLocation,
    jobDepartment: raw.jobDepartment,
    jobEmploymentType: raw.jobEmploymentType,
    fitScore: raw.fitScore,
    recommendation: raw.recommendation,
    alignment: serializeAlignment(raw.alignment as CriterionAlignment[] | null),
    signal: raw.signal,
    gaps: raw.gaps ?? [],
    summary: raw.summary,
  };
}
