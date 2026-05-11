/**
 * assessment.evaluate — Score a submitted assessment via pluggable outcome analyzers.
 *
 * Routes to the correct analyzer based on assessment type:
 *   technical        → subjective (AI rubric scoring)
 *   aptitude         → mcq (exact match)
 *   coding           → coding (AI code review)
 *   case_study       → case_study (AI rubric scoring of written response)
 *   interview_rubric → interview_rubric (rubric scored from interview transcript; no candidate submission, attempt must be tagged with an interview)
 *   personality      → personality (AI trait extraction)
 */

import { db } from "@/db/client";
import { assessmentAttempts, assessments, assessmentIntelligence, interviews } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { withExecutionLog } from "@/lib/execution-log";
import { getAnalyzer, resolveAnalyzerType } from "@/automations/analyzers";
import type { AnalyzerInput } from "@/automations/analyzers/types";

async function upsertAssessmentIntelligence(
  attemptId: string,
  organizationId: string,
  data: Partial<typeof assessmentIntelligence.$inferInsert>,
) {
  const existing = await db.query.assessmentIntelligence.findFirst({
    where: eq(assessmentIntelligence.attemptId, attemptId),
  });

  if (existing) {
    await db
      .update(assessmentIntelligence)
      .set({ ...data, evaluationCount: existing.evaluationCount + 1, lastEvaluatedAt: new Date(), updatedAt: new Date() })
      .where(eq(assessmentIntelligence.id, existing.id));
    return { id: existing.id, action: "updated" as const };
  }

  const id = nanoid();
  await db.insert(assessmentIntelligence).values({
    id,
    organizationId,
    attemptId,
    ...data,
  });
  return { id, action: "created" as const };
}

export async function assessmentEvaluate(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
}) {
  const { organizationId, entityId, traceId } = params;

  return withExecutionLog(db, {
    taskId: "assessment-evaluate",
    organizationId,
    entityType: "assessment_attempt",
    entityId,
    traceId,
  }, async (log) => {
    const attempt = await db.query.assessmentAttempts.findFirst({
      where: and(eq(assessmentAttempts.id, entityId), eq(assessmentAttempts.organizationId, organizationId)),
    });
    if (!attempt) return { skipped: true, reason: "attempt_not_found" };

    const assessment = await db.query.assessments.findFirst({
      where: eq(assessments.id, attempt.assessmentId),
      with: { questions: true },
    });
    if (!assessment) return { skipped: true, reason: "assessment_not_found" };

    const isTranscriptMode = assessment.type === "interview_rubric";

    // Submission gate: skip for transcript-mode (candidate never submits).
    if (!isTranscriptMode && attempt.status !== "submitted") {
      return { skipped: true, reason: "not_submitted", currentStatus: attempt.status };
    }

    // Answers gate: only required for submission-mode assessments.
    const rawAnswers = attempt.answers;
    let answers: Record<string, unknown> = {};
    if (!isTranscriptMode) {
      if (!rawAnswers) return { skipped: true, reason: "no_answers" };
      if (Array.isArray(rawAnswers)) {
        for (const ans of rawAnswers as Array<{ questionId: string; answer?: string; value?: string }>) {
          answers[ans.questionId] = ans.answer ?? ans.value ?? "";
        }
      } else {
        answers = rawAnswers as Record<string, unknown>;
      }
    }

    // For transcript mode, fetch the linked interview's transcript.
    let transcript: string | undefined;
    if (isTranscriptMode) {
      if (!attempt.interviewId) return { skipped: true, reason: "no_interview_link" };
      const interview = await db.query.interviews.findFirst({
        where: eq(interviews.id, attempt.interviewId),
      });
      if (!interview?.transcript?.trim()) return { skipped: true, reason: "no_transcript_yet" };
      transcript = interview.transcript;
    }

    // Route to the correct analyzer based on assessment type / evidence mode
    const analyzerType = resolveAnalyzerType(assessment);
    const analyzer = getAnalyzer(analyzerType);

    const input: AnalyzerInput = {
      questions: (assessment.questions ?? []).map((q) => ({
        id: q.id,
        text: q.text ?? q.id,
        type: q.type,
        weight: q.weight ?? 1,
        correctAnswer: q.correctAnswer,
        rubric: q.rubric,
        options: q.options,
      })),
      answers,
      assessment: {
        title: assessment.title,
        type: assessment.type ?? "",
        config: (assessment.config as Record<string, unknown>) ?? undefined,
      },
      transcript,
    };

    let output;
    try {
      output = await analyzer.analyze(input);
    } catch (analyzerError) {
      console.error("[assessment-evaluate] Analyzer failed:", analyzerType, analyzerError);
      throw analyzerError;
    }

    const evaluation = {
      score: output.score,
      breakdown: output.breakdown,
      insights: output.insights,
      summary: output.summary,
      analyzerType,
    };

    // Update attempt with evaluation results
    await db
      .update(assessmentAttempts)
      .set({
        status: "evaluated",
        ...(output.score !== null ? { score: output.score } : {}),
        evaluation: evaluation as any,
        evaluatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(assessmentAttempts.id, entityId));

    // Write to assessment_intelligence table
    const intelRecord = await upsertAssessmentIntelligence(entityId, organizationId, {
      evaluation: evaluation as any,
    });
    log.setOutput("assessment_intelligence", intelRecord.id, intelRecord.action);

    return { success: true, score: output.score, analyzerType, detailCount: output.breakdown.length };
  });
}

/**
 * Bridge: after assessment evaluation, trigger pipeline evidence update
 * for the linked application (if any).
 */
export async function assessmentUpdateApplicationEvidence(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
}) {
  const { organizationId, entityId, traceId } = params;

  const attempt = await db.query.assessmentAttempts.findFirst({
    where: and(eq(assessmentAttempts.id, entityId), eq(assessmentAttempts.organizationId, organizationId)),
  });
  if (!attempt?.applicationId) return { skipped: true, reason: "no_application_linked" };

  const { pipelineUpdateEvidence } = await import("./pipeline");
  return pipelineUpdateEvidence({ organizationId, entityId: attempt.applicationId, traceId });
}
