/**
 * Interview detail serialization.
 * Types flow from: DB schema ($inferSelect) → serialize → client component.
 */

import type { Interview } from "@/db/schema/interviews";
import type { Application } from "@/db/schema/applications";
import type { Candidate } from "@/db/schema/candidates";
import type { Role, RoleCriteriaConfig } from "@/db/schema/roles";
import type { Scorecard, ScorecardRatingEntry, InterviewStage, InterviewPanelist } from "@/db/schema/interviews";
import type { InterviewIntelligenceRow, InterviewPrep, InterviewEvaluation } from "@/db/schema/intelligence";
import type { TriageItem } from "@/db/schema/triage-items";

// -- Derived types ---------------------------------------------------

export interface SerializedScorecardRating {
  competency: string;
  rating: number;
  evidence: string;
}

export interface SerializedScorecard {
  id: string;
  reviewerId: string | null;
  reviewerName: string | null;
  overallRating: number | null;
  verdict: string | null;
  notes: string | null;
  ratings: SerializedScorecardRating[];
  createdAt: string;
}

export interface SerializedPanelist {
  userId: string;
  name: string;
  role: string;
}

export interface SerializedActivityEntry {
  id: string;
  type: string;
  urgency: string;
  title: string;
  subtitle: string | null;
  action: string | null;
  status: string;
  createdAt: string;
}

export interface InterviewDetailProps {
  id: string;
  candidateName: string | null;
  candidateId: string | null;
  roleName: string | null;
  roleId: string | null;
  applicationId: string;
  stageName: string | null;
  stageCompetencies: string[];
  panelistNames: string[];
  interviewType: string | null;
  scheduledAt: string | null;
  durationMins: number | null;
  meetingLink: string | null;
  location: string | null;
  evidenceTarget: string | null;
  transcript: string | null;
  intelligenceId: string | null;
  notes: string | null;
  status: string;
  recordingStatus: string;
  recordingUrl: string | null;
  candidateToken: string | null;
  scorecards: SerializedScorecard[];
  panelists: SerializedPanelist[];
  prep: InterviewPrep | null;
  evaluation: InterviewEvaluation | null;
  activityLog: SerializedActivityEntry[];
}

// -- Helpers ---------------------------------------------------------

function serializeDate(d: Date | string | null): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : String(d);
}

// -- Main serializer -------------------------------------------------

type PanelistWithUser = InterviewPanelist & { user?: { name: string } | null };

type InterviewWithRelations = Interview & {
  application?: (Application & { candidate?: Candidate; role?: Role }) | null;
  stage?: InterviewStage | null;
  scorecards?: Scorecard[];
  intelligence?: InterviewIntelligenceRow | null;
  panelists?: PanelistWithUser[];
};

export function serializeInterviewDetail(iv: InterviewWithRelations, activityLog: TriageItem[] = []): InterviewDetailProps {
  // Fallback to role criteria if stage competencies are empty
  const stageCompetencies = iv.stage?.competencies ?? [];
  const roleCriteria = iv.application?.role?.criteriaConfig as RoleCriteriaConfig | null;
  const competencies = stageCompetencies.length > 0
    ? stageCompetencies
    : (roleCriteria?.criteria?.map((c) => c.name) ?? []);

  return {
    id: iv.id,
    candidateName: iv.application?.candidate?.name ?? null,
    candidateId: iv.application?.candidate?.id ?? iv.candidateId ?? null,
    roleName: iv.application?.role?.title ?? null,
    roleId: iv.application?.role?.id ?? iv.roleId ?? null,
    applicationId: iv.applicationId,
    stageName: iv.stage?.name ?? null,
    stageCompetencies: competencies,
    panelistNames: (iv.panelists ?? []).map((p) => p.user?.name ?? "Unknown").filter(Boolean),
    interviewType: iv.interviewType,
    scheduledAt: serializeDate(iv.scheduledAt),
    durationMins: iv.durationMins,
    meetingLink: iv.meetingLink,
    location: iv.location,
    evidenceTarget: iv.intelligence?.evidenceTarget ?? iv.evidenceTarget,
    transcript: iv.transcript ?? null,
    intelligenceId: iv.intelligence?.id ?? null,
    notes: iv.notes,
    status: iv.status,
    recordingStatus: iv.recordingStatus ?? "none",
    recordingUrl: iv.recordingUrl ?? null,
    candidateToken: iv.candidateToken ?? null,
    scorecards: (iv.scorecards ?? []).map((sc) => ({
      id: sc.id,
      reviewerId: sc.reviewerId ?? null,
      reviewerName: sc.reviewerName,
      overallRating: sc.overallRating,
      verdict: sc.verdict,
      notes: sc.notes,
      ratings: ((sc.ratings as ScorecardRatingEntry[]) ?? []).map((r) => ({
        competency: r.competency,
        rating: r.rating,
        evidence: r.evidence,
      })),
      createdAt: serializeDate(sc.createdAt) ?? "",
    })),
    panelists: (iv.panelists ?? []).map((p) => ({
      userId: p.userId,
      name: p.user?.name ?? "Unknown",
      role: p.role,
    })),
    prep: (iv.intelligence?.prep as InterviewPrep) ?? null,
    evaluation: (iv.intelligence?.evaluation as InterviewEvaluation) ?? null,
    activityLog: activityLog.map((t) => ({
      id: t.id,
      type: t.type,
      urgency: t.urgency,
      title: t.title,
      subtitle: t.subtitle ?? null,
      action: t.action ?? null,
      status: t.status,
      createdAt: (t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt ?? "")),
    })),
  };
}
