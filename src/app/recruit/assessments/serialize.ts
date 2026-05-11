/**
 * Assessments page serialization — transforms DB results into client-safe props.
 */

import type { Assessment, AssessmentQuestion, AssessmentAttempt } from "@/db/schema/assessments";
import type { Candidate } from "@/db/schema/candidates";
import type { Application } from "@/db/schema/applications";
import type { Role } from "@/db/schema/roles";

// Enums imported for local use
import {
  ASSESSMENT_TYPES,
  ASSESSMENT_ORIGINS,
  ASSESSMENT_STATUSES,
  ASSESSMENT_VISIBILITIES,
  QUESTION_TYPES,
  ATTEMPT_STATUSES,
} from "@/db/schema/assessments";

import type {
  AssessmentType,
  AssessmentOrigin,
  AssessmentStatus,
  AssessmentVisibility,
  QuestionType,
  AttemptStatus,
} from "@/db/schema/assessments";

export type {
  AssessmentType,
  AssessmentOrigin,
  AssessmentStatus,
  AttemptStatus,
};

// -- Assessment with questions relation --------------------------------------

type AssessmentWithQuestions = Assessment & {
  questions?: AssessmentQuestion[];
  attempts?: AssessmentAttempt[];
};

type AttemptWithRelations = AssessmentAttempt & {
  assessment?: Assessment;
  candidate?: Candidate;
  application?: Application & { role?: Role };
  interview?: { id: string; transcript: string | null } | null;
};

// -- Serialized types --------------------------------------------------------

export interface SerializedAssessment {
  id: string;
  title: string;
  description: string | null;
  type: AssessmentType | null;
  origin: AssessmentOrigin;
  questionCount: number;
  completedCount: number;
  avgScore: number;
  activeCount: number;
  status: AssessmentStatus;
  updatedAt: string;
}

export interface SerializedAttempt {
  id: string;
  assessmentId: string;
  candidateName: string;
  roleName: string;
  assessmentTitle: string;
  status: AttemptStatus;
  assignedAt: string | null;
  deadlineAt: string | null;
  score: number | null;
  /**
   * Why an `in_progress` attempt isn't actually progressing. Surfaced as a
   * pill on the attempt card so recruiters can distinguish a stuck attempt
   * from one that's correctly waiting on a downstream signal.
   *  - `transcript`: interview_rubric attempt is attached to an interview
   *    that hasn't produced a transcript yet (call still pending or in
   *    flight). Resolves automatically when the voice worker dumps the
   *    transcript at end-of-call.
   *  - `interview_link`: interview_rubric attempt has no interview attached
   *    (configuration bug — should be caught at create time but we surface
   *    it for legacy rows).
   */
  waitingFor: "transcript" | "interview_link" | null;
}

export interface AssessmentsPageProps {
  assessments: SerializedAssessment[];
  assessmentsTotal: number;
  attempts: SerializedAttempt[];
  attemptsTotal: number;
}

// -- Helpers -----------------------------------------------------------------

function formatDate(d: Date | string | null): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateTime(d: Date | string | null): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// -- Serializers -------------------------------------------------------------

export function serializeAssessment(
  assessment: AssessmentWithQuestions,
  stats: { completedCount: number; avgScore: number; activeCount: number }
): SerializedAssessment {
  return {
    id: assessment.id,
    title: assessment.title,
    description: assessment.description,
    type: assessment.type,
    origin: assessment.origin,
    questionCount: assessment.questions?.length ?? 0,
    completedCount: stats.completedCount,
    avgScore: stats.avgScore,
    activeCount: stats.activeCount,
    status: assessment.status,
    updatedAt: formatDateTime(assessment.updatedAt),
  };
}

function deriveWaitingFor(
  attempt: AttemptWithRelations,
): SerializedAttempt["waitingFor"] {
  if (attempt.assessment?.type !== "interview_rubric") return null;
  if (attempt.status !== "in-progress") return null;
  if (!attempt.interviewId) return "interview_link";
  if (!attempt.interview?.transcript?.trim()) return "transcript";
  return null;
}

export function serializeAttempt(attempt: AttemptWithRelations): SerializedAttempt {
  return {
    id: attempt.id,
    assessmentId: attempt.assessmentId,
    candidateName: attempt.candidate?.name ?? "Unknown",
    roleName: attempt.application?.role?.title ?? "Unknown",
    assessmentTitle: attempt.assessment?.title ?? "Unknown",
    status: attempt.status,
    assignedAt: formatDate(attempt.createdAt),
    deadlineAt: formatDate(attempt.deadlineAt),
    score: attempt.score,
    waitingFor: deriveWaitingFor(attempt),
  };
}

export function serializeAssessmentsList(
  assessments: AssessmentWithQuestions[],
  statsMap: Record<string, { completedCount: number; avgScore: number; activeCount: number }>,
  attempts: AttemptWithRelations[]
): AssessmentsPageProps {
  // Deduplicate assessments by id
  const uniqueAssessments = Array.from(
    new Map(assessments.map((a) => [a.id, a])).values()
  );

  return {
    assessments: uniqueAssessments.map((a) =>
      serializeAssessment(a, statsMap[a.id] ?? { completedCount: 0, avgScore: 0, activeCount: 0 })
    ),
    assessmentsTotal: uniqueAssessments.length,
    attempts: attempts.map(serializeAttempt),
    attemptsTotal: attempts.length,
  };
}
