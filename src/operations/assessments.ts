import { createEntityCrud } from "@/lib/crud";
import { db } from "@/db/client";
import { assessments, assessmentQuestions, assessmentAttempts } from "@/db/schema";
import { assessmentSchema, assessmentQuestionSchema, assessmentAttemptSchema } from "./schemas";
import { and, eq, sql } from "drizzle-orm";

/**
 * Normalize answers from DB to simple string values.
 * Handles both formats:
 * - { [qId]: "answer" } (from live assessment auto-save)
 * - { [qId]: { value: "answer", score?: number } } (from recruiter evaluation)
 */
function normalizeAnswersToStrings(answers: unknown): Record<string, string> {
  if (!answers || typeof answers !== "object") return {};
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(answers as Record<string, unknown>)) {
    if (typeof val === "string") {
      result[key] = val;
    } else if (val && typeof val === "object" && "value" in val) {
      result[key] = String((val as { value: unknown }).value ?? "");
    }
  }
  return result;
}

import { safeRevalidate } from "@/lib/safe-revalidate";

// --- Assessment CRUD -------------------------------------------------------

const assessmentCrud = createEntityCrud({
  db,
  table: assessments,
  queryKey: "assessments",
  idField: "id",
  schema: assessmentSchema,
  onMutate: () => safeRevalidate("/recruit/assessments"),
  getWith: { questions: true, attempts: true },
  searchFields: ["title", "description"],
});

export const getAssessments = assessmentCrud.list;
export const searchAssessments = assessmentCrud.search;
export const getAssessment = assessmentCrud.get;
export const createAssessment = assessmentCrud.create;
export const updateAssessment = assessmentCrud.update;
export const deleteAssessment = assessmentCrud.delete;

// --- Assessment Questions CRUD ---------------------------------------------

const questionCrud = createEntityCrud({
  db,
  table: assessmentQuestions,
  queryKey: "assessmentQuestions",
  idField: "id",
  schema: assessmentQuestionSchema,
  onMutate: () => safeRevalidate("/recruit/assessments"),
  getWith: { assessment: true },
});

const getAssessmentQuestion = questionCrud.get;
export const createAssessmentQuestion = questionCrud.create;
export const updateAssessmentQuestion = questionCrud.update;

/**
 * Custom delete for assessment questions.
 * The assessmentQuestions table doesn't have organizationId, so we validate
 * org ownership through the parent assessment.
 */
export async function deleteAssessmentQuestion(questionId: string) {
  // First, get the question to find its parent assessment
  const question = await db.query.assessmentQuestions.findFirst({
    where: eq(assessmentQuestions.id, questionId),
    with: { assessment: true },
  });

  if (!question) {
    throw new Error("Assessment question not found");
  }

  // Import getActionContext lazily to avoid circular dependencies
  const { getActionContext } = await import("@/lib/auth/context");
  const ctx = await getActionContext();

  // Validate org ownership through the parent assessment
  if (question.assessment?.organizationId !== ctx.organizationId) {
    throw new Error("Not authorized to delete this question");
  }

  // Perform the delete
  await db.delete(assessmentQuestions).where(eq(assessmentQuestions.id, questionId));

  safeRevalidate("/recruit/assessments");
}

export async function getAssessmentQuestions(assessmentId: string) {
  return db.query.assessmentQuestions.findMany({
    where: eq(assessmentQuestions.assessmentId, assessmentId),
    orderBy: (q, { asc }) => [asc(q.order)],
  });
}

// --- Assessment Attempts CRUD ----------------------------------------------

const attemptCrud = createEntityCrud({
  db,
  table: assessmentAttempts,
  queryKey: "assessmentAttempts",
  idField: "id",
  schema: assessmentAttemptSchema,
  onMutate: () => safeRevalidate("/recruit/assessments"),
  getWith: {
    assessment: true,
    candidate: true,
    application: true,
    // Pulled in so the recruiter UI can distinguish "interview_rubric
    // waiting for transcript" from "stuck in_progress" — see
    // serializeAttempt and the WaitingFor pill.
    interview: { columns: { id: true, transcript: true } },
  },
});

export const getAssessmentAttempts = attemptCrud.list;
export const getAssessmentAttempt = attemptCrud.get;
export const updateAssessmentAttempt = attemptCrud.update;
export const deleteAssessmentAttempt = attemptCrud.delete;

/**
 * Create an assessment attempt. Enforces the invariant that interview_rubric
 * assessments must be tagged with an interview — there's no submission flow,
 * so without an interview link there's no transcript to grade.
 */
export const createAssessmentAttempt: typeof attemptCrud.create = async (data) => {
  const assessmentId = (data as { assessmentId?: string }).assessmentId;
  const interviewId = (data as { interviewId?: string }).interviewId;
  if (assessmentId) {
    const a = await db.query.assessments.findFirst({
      where: eq(assessments.id, assessmentId),
      columns: { type: true },
    });
    if (a?.type === "interview_rubric" && !interviewId) {
      throw new Error("interview_rubric assessments require an interviewId on the attempt");
    }
  }
  return attemptCrud.create(data);
};

// --- Custom Lifecycle Operations -------------------------------------------

export async function saveAssessmentDraft(attemptId: string, answers: unknown) {
  await updateAssessmentAttempt(attemptId, { answers });
}

export async function submitAssessmentAttempt(attemptId: string) {
  await updateAssessmentAttempt(attemptId, {
    status: "submitted",
    submittedAt: new Date(),
  });
}

/** Panelist ends the assessment — collects answers and triggers evaluation */
export async function endAssessmentAttempt(attemptId: string) {
  await updateAssessmentAttempt(attemptId, {
    status: "submitted",
    submittedAt: new Date(),
  });
}

/** Panelist cancels the assessment — discards, no evaluation */
export async function cancelAssessmentAttempt(attemptId: string) {
  await updateAssessmentAttempt(attemptId, {
    status: "cancelled",
  });
}

// --- Practice Assessment (AI-generated) -----------------------------------

async function createPracticeAssessment(params: {
  organizationId: string;
  candidateId: string;
  origin: "ai_practice" | "ai_rapid_fire" | "ai_mock_interview";
  title: string;
  interviewId?: string;
  categories: Array<{ category: string; questions: string[] }>;
}) {
  const assessment = await createAssessment({
    organizationId: params.organizationId,
    title: params.title,
    type: "aptitude",
    origin: params.origin,
    visibility: "private",
    status: "active",
  });

  let order = 0;
  for (const cat of params.categories) {
    for (const q of cat.questions) {
      await createAssessmentQuestion({
        assessmentId: assessment.id,
        text: q,
        type: "SHORT_TEXT",
        order: order++,
        weight: 1,
        options: { category: cat.category },
      });
    }
  }

  const attempt = await createAssessmentAttempt({
    organizationId: params.organizationId,
    assessmentId: assessment.id,
    candidateId: params.candidateId,
    status: "in-progress",
    startedAt: new Date(),
  });

  return { assessmentId: assessment.id, attemptId: attempt.id };
}

export async function submitAttemptAnswers(attemptId: string, answers: Record<string, string>) {
  return updateAssessmentAttempt(attemptId, {
    answers,
    status: "submitted",
    submittedAt: new Date(),
  });
}

async function completeAttemptEvaluation(attemptId: string, evaluation: { score: number; strengths: string[]; improvements: string[]; refinedAnswerTips: string[] }) {
  return updateAssessmentAttempt(attemptId, {
    evaluation,
    score: evaluation.score,
    status: "evaluated",
    evaluatedAt: new Date(),
  });
}

async function createMockInterviewAssessment(params: {
  organizationId: string;
  candidateId: string;
  title: string;
  interviewId?: string;
  data: Record<string, unknown>;
  readinessScore?: number | null;
}) {
  const assessment = await createAssessment({
    organizationId: params.organizationId,
    title: params.title,
    type: "aptitude",
    origin: "ai_mock_interview" as const,
    visibility: "private",
    status: "active",
  });

  const attempt = await createAssessmentAttempt({
    organizationId: params.organizationId,
    assessmentId: assessment.id,
    candidateId: params.candidateId,
    status: "completed",
    answers: params.data,
    score: params.readinessScore ?? undefined,
    startedAt: new Date(),
    submittedAt: new Date(),
  });

  return { assessmentId: assessment.id, attemptId: attempt.id };
}

// --- Live Interview Assessments ----------------------------------------------

export async function launchLiveAssessment(params: {
  interviewId: string;
  assessmentId: string;
  candidateId: string;
  organizationId: string;
  applicationId?: string;
  timeLimitMins?: number;
}) {
  const deadlineAt = params.timeLimitMins
    ? new Date(Date.now() + params.timeLimitMins * 60 * 1000)
    : undefined;

  // Check for existing attempt for same candidate + assessment to prevent duplicates
  // (e.g. pipeline auto-assigned a "pending" attempt before the interview started)
  const existing = await db.query.assessmentAttempts.findFirst({
    where: and(
      eq(assessmentAttempts.candidateId, params.candidateId),
      eq(assessmentAttempts.assessmentId, params.assessmentId),
      eq(assessmentAttempts.organizationId, params.organizationId),
    ),
  });

  let attempt;
  if (existing && (existing.status === "pending" || existing.status === "in-progress")) {
    // Reuse existing attempt — upgrade to in-progress and link to this interview
    await updateAssessmentAttempt(existing.id, {
      interviewId: params.interviewId,
      applicationId: params.applicationId ?? existing.applicationId,
      status: "in-progress",
      startedAt: new Date(),
      ...(deadlineAt ? { deadlineAt } : {}),
    });
    attempt = { id: existing.id };
  } else if (existing && (existing.status === "evaluated" || existing.status === "submitted" || existing.status === "completed")) {
    // Already evaluated/submitted — return existing without modification
    attempt = { id: existing.id };
  } else {
    attempt = await createAssessmentAttempt({
      organizationId: params.organizationId,
      assessmentId: params.assessmentId,
      candidateId: params.candidateId,
      applicationId: params.applicationId,
      interviewId: params.interviewId,
      status: "in-progress",
      startedAt: new Date(),
      deadlineAt,
    });
  }

  // Fetch questions, strip sensitive fields
  const questions = await db.query.assessmentQuestions.findMany({
    where: eq(assessmentQuestions.assessmentId, params.assessmentId),
    orderBy: (q, { asc }) => [asc(q.order)],
  });
  const safeQuestions = questions.map(({ correctAnswer, rubric, ...q }) => q);

  const assessment = await getAssessment(params.assessmentId);

  return {
    attemptId: attempt.id,
    assessmentId: params.assessmentId,
    title: assessment?.title ?? "Assessment",
    status: "in-progress" as const,
    questions: safeQuestions,
    deadlineAt: deadlineAt?.toISOString() ?? null,
  };
}

export async function getInterviewLiveAttempts(interviewId: string) {
  const attempts = await db.query.assessmentAttempts.findMany({
    where: sql`${assessmentAttempts.interviewId} = ${interviewId} AND ${assessmentAttempts.status} IN ('pending', 'in-progress')`,
    with: {
      assessment: {
        with: { questions: true },
      },
    },
  });

  return attempts.map((attempt) => {
    const safeQuestions = (attempt.assessment?.questions ?? []).map(
      ({ correctAnswer, rubric, ...q }) => q,
    );
    return {
      attemptId: attempt.id,
      assessmentId: attempt.assessmentId,
      title: attempt.assessment?.title ?? "Assessment",
      status: attempt.status,
      questions: safeQuestions,
      existingAnswers: normalizeAnswersToStrings(attempt.answers),
      deadlineAt: attempt.deadlineAt?.toISOString() ?? null,
      startedAt: attempt.startedAt?.toISOString() ?? null,
      answeredCount: Object.values(normalizeAnswersToStrings(attempt.answers)).filter(
        (v) => v.trim(),
      ).length,
      totalQuestions: safeQuestions.length,
    };
  });
}

/**
 * Get all completed/evaluated assessments for a candidate (for display in interview room)
 */
export async function getCandidateCompletedAssessments(candidateId: string) {
  const attempts = await db.query.assessmentAttempts.findMany({
    where: sql`${assessmentAttempts.candidateId} = ${candidateId} AND ${assessmentAttempts.status} IN ('completed', 'evaluated')`,
    with: {
      assessment: true,
    },
    orderBy: (a, { desc }) => [desc(a.submittedAt)],
  });

  return attempts.map((attempt) => ({
    attemptId: attempt.id,
    assessmentId: attempt.assessmentId,
    title: attempt.assessment?.title ?? "Assessment",
    type: attempt.assessment?.type ?? null,
    status: attempt.status,
    score: attempt.score,
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    evaluatedAt: attempt.evaluatedAt?.toISOString() ?? null,
  }));
}

// --- Aggregate Queries ------------------------------------------------------

export async function getAssessmentStats(organizationId: string) {
  // Include both 'completed' and 'evaluated' statuses - evaluation task sets status to 'evaluated'
  const stats = await db
    .select({
      assessmentId: assessmentAttempts.assessmentId,
      completedCount: sql<number>`count(*) FILTER (WHERE ${assessmentAttempts.status} IN ('completed', 'evaluated'))::int`,
      avgScore: sql<number>`round(avg(${assessmentAttempts.score}) FILTER (WHERE ${assessmentAttempts.status} IN ('completed', 'evaluated')))::int`,
      activeCount: sql<number>`count(*) FILTER (WHERE ${assessmentAttempts.status} NOT IN ('completed', 'evaluated'))::int`,
    })
    .from(assessmentAttempts)
    .where(eq(assessmentAttempts.organizationId, organizationId))
    .groupBy(assessmentAttempts.assessmentId);

  const map: Record<string, { completedCount: number; avgScore: number; activeCount: number }> = {};
  for (const row of stats) {
    map[row.assessmentId] = {
      completedCount: row.completedCount ?? 0,
      avgScore: row.avgScore ?? 0,
      activeCount: row.activeCount ?? 0,
    };
  }
  return map;
}
