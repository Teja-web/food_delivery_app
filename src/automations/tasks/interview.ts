/**
 * interview.intake — Generate AI prep plan and evidence targets for an upcoming interview.
 * interview.processEvidence — Unified evidence processor: transcript + scorecards + assessments → InterviewEvaluation.
 * interview.evaluateMatchForInterview — Resolve intelligence → interview → application → match evaluation.
 */

import { db } from "@/db/client";
import { interviews, interviewIntelligence, interviewStages, scorecards, applications, assessments } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { withExecutionLog } from "@/lib/execution-log";
import { interviewPrepPlannerPrompt } from "../agents/prompts/interview-prep-planner";
import { interviewPrepPlannerAgent, interviewPrepSchema } from "../agents/definitions/interview-prep-planner";
import { interviewScorecardAnalyzerPromptWithContext } from "../agents/prompts/interview-scorecard-analyzer";
import { interviewScorecardAnalyzerAgent, interviewScorecardAnalysisSchema } from "../agents/definitions/interview-scorecard-analyzer";
import { transcriptAnalyzerPromptWithContext } from "../agents/prompts/interview-transcript-analyzer";
import { interviewTranscriptAnalyzerAgent, transcriptAnalysisSchema } from "../agents/definitions/interview-transcript-analyzer";
import { generate } from "@/lib/ai";
import { getCandidateContext } from "@/operations/candidates";
import { getRoleContext } from "@/operations/roles";
import { assessmentAttempts } from "@/db/schema";
import type { InterviewEvaluation, AssessmentEvaluation } from "@/db/schema/intelligence";

// -- Helpers --------------------------------------------------------------

async function upsertIntelligence(
  interviewId: string,
  organizationId: string,
  data: Partial<typeof interviewIntelligence.$inferInsert>,
) {
  const existing = await db.query.interviewIntelligence.findFirst({
    where: eq(interviewIntelligence.interviewId, interviewId),
  });

  if (existing) {
    // Atomic increment of evaluationCount to handle concurrent runs safely.
    // If two runs race, both will write their evaluation but the count
    // will reflect the actual number of runs, not a stale read+increment.
    const setData: Record<string, unknown> = { ...data, updatedAt: new Date() };
    if ("evaluationCount" in setData) {
      setData.evaluationCount = sql`${interviewIntelligence.evaluationCount} + 1`;
    }
    await db
      .update(interviewIntelligence)
      .set(setData as any)
      .where(eq(interviewIntelligence.id, existing.id));
    return { id: existing.id, action: "updated" as const };
  }

  const id = nanoid();
  await db.insert(interviewIntelligence).values({
    id,
    organizationId,
    interviewId,
    ...data,
  });
  return { id, action: "created" as const };
}

// -- interview.intake -----------------------------------------------------

export async function interviewIntake(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
}) {
  const { organizationId, entityId, traceId } = params;

  return withExecutionLog(db, {
    taskId: "interview-intake",
    organizationId,
    entityType: "interview",
    entityId,
    traceId,
    actorId: interviewPrepPlannerAgent.slug,
  }, async (log) => {
    const interview = await db.query.interviews.findFirst({
      where: and(eq(interviews.id, entityId), eq(interviews.organizationId, organizationId)),
    });
    if (!interview) return { skipped: true, reason: "interview_not_found" };

    const entry = await db.query.applications.findFirst({
      where: eq(applications.id, interview.applicationId),
    });
    if (!entry) return { skipped: true, reason: "application_not_found" };

    // Entity contexts — candidate includes intelligence, interviews, assessments, match history
    // Role includes criteria, stages, org identity
    const [candidateContext, roleContext] = await Promise.all([
      getCandidateContext(entry.candidateId),
      getRoleContext(entry.roleId),
    ]);
    if (!candidateContext || !roleContext) return { skipped: true, reason: "context_not_found" };

    // Interview-specific: target competencies from stage
    let targetCompetencies: string[] = [];
    if (interview.stageId) {
      const stage = await db.query.interviewStages.findFirst({
        where: eq(interviewStages.id, interview.stageId),
      });
      targetCompetencies = stage?.competencies ?? [];
    }
    if (targetCompetencies.length === 0) {
      const allStages = await db.query.interviewStages.findMany({
        where: eq(interviewStages.roleId, entry.roleId),
      });
      const matchingStage = allStages.find((s) => s.type === interview.interviewType || s.name === interview.interviewType);
      targetCompetencies = matchingStage?.competencies ?? [];
    }

    // Generate prep plan via AI agent
    const prompt = `${interviewPrepPlannerPrompt}

${candidateContext}

${roleContext}

## INTERVIEW STAGE
Type: ${interview.interviewType ?? "general"}
Duration: ${interview.durationMins ?? 45} minutes
Target Competencies: ${targetCompetencies.join(", ") || "General assessment"}`;

    const result = await generate({ agent: interviewPrepPlannerAgent, prompt, output: interviewPrepSchema });
    const prep = (result as any).object;

    const evidenceTarget = targetCompetencies.join(", ");

    // Store in interview_intelligence table
    const intelRecord = await upsertIntelligence(entityId, organizationId, {
      prep,
      evidenceTarget: evidenceTarget || null,
    });
    log.setOutput("interview_intelligence", intelRecord.id, intelRecord.action);

    // Always update the interview record to trigger SSE refresh
    // This ensures the UI reloads with the newly generated prep
    await db
      .update(interviews)
      .set({
        evidenceTarget: evidenceTarget || null,
        updatedAt: new Date(),
      })
      .where(eq(interviews.id, entityId));

    return { success: true, targetCompetencies };
  });
}

// -- interview.processEvidence --------------------------------------------

export async function interviewProcessEvidence(params: {
  organizationId: string;
  entityId: string;
  entityType?: string;
  traceId?: string;
}) {
  const { organizationId, entityId, entityType, traceId } = params;

  // Resolve interviewId — entityId may be a scorecard ID
  let interviewId = entityId;
  if (entityType === "scorecard") {
    const card = await db.query.scorecards.findFirst({
      where: and(eq(scorecards.id, entityId), eq(scorecards.organizationId, organizationId)),
    });
    if (!card) return { skipped: true, reason: "scorecard_not_found" };
    interviewId = card.interviewId;
  }

  return withExecutionLog(db, {
    taskId: "interview-process-evidence",
    organizationId,
    entityType: "interview",
    entityId: interviewId,
    traceId,
    actorId: "interview-evaluator",
  }, async (log) => {
    // 1. Load interview
    const interview = await db.query.interviews.findFirst({
      where: and(eq(interviews.id, interviewId), eq(interviews.organizationId, organizationId)),
    });
    if (!interview) return { skipped: true, reason: "interview_not_found" };

    // 2. Load all evidence
    const cards = await db.query.scorecards.findMany({
      where: eq(scorecards.interviewId, interviewId),
    });
    const attempts = await db.query.assessmentAttempts.findMany({
      where: and(
        eq(assessmentAttempts.interviewId, interviewId),
        eq(assessmentAttempts.status, "evaluated"),
      ),
      with: { assessment: true, intelligence: true },
    });

    const hasTranscript = !!interview.transcript;
    const hasScorecards = cards.length > 0;
    const hasAssessments = attempts.length > 0;
    if (!hasTranscript && !hasScorecards && !hasAssessments) {
      return { skipped: true, reason: "no_evidence" };
    }

    // 3. Load context
    const entry = await db.query.applications.findFirst({
      where: eq(applications.id, interview.applicationId),
    });
    if (!entry) return { skipped: true, reason: "application_not_found" };

    const candidateContext = await getCandidateContext(entry.candidateId);
    const intel = await db.query.interviewIntelligence.findFirst({
      where: eq(interviewIntelligence.interviewId, interviewId),
    });
    const targetCompetencies = (intel?.evidenceTarget ?? interview.evidenceTarget ?? "")
      .split(", ")
      .filter(Boolean);
    const competenciesText = targetCompetencies.join(", ") || "general assessment";

    // 4. Run agents conditionally
    let transcriptResult: Awaited<ReturnType<typeof generate>>["object"] | null = null;
    let synthesisResult: Awaited<ReturnType<typeof generate>>["object"] | null = null;

    if (hasTranscript) {
      const prompt = transcriptAnalyzerPromptWithContext({
        transcript: interview.transcript!,
        roleCompetencies: competenciesText,
        candidateContext: candidateContext ?? "Unknown candidate",
        interviewType: interview.interviewType ?? "general",
      });
      const result = await generate({
        agent: interviewTranscriptAnalyzerAgent,
        prompt,
        output: transcriptAnalysisSchema,
      });
      transcriptResult = (result as any).object;
    }

    if (hasScorecards) {
      const scorecardsText = cards.map((card) => {
        const ratings = (card.ratings ?? []) as Array<{ competency: string; rating: number; evidence: string }>;
        const ratingsText = ratings.map((r) => `  ${r.competency}: ${r.rating}/5 — ${r.evidence}`).join("\n");
        return `Reviewer: ${card.reviewerName ?? "Anonymous"}\nOverall: ${card.overallRating ?? "N/A"}/5, Verdict: ${card.verdict ?? "N/A"}\n${ratingsText}`;
      }).join("\n---\n");

      // Build assessment context text for the synthesizer
      const assessmentText = hasAssessments
        ? attempts.map((a) => {
            const eval_ = a.intelligence?.evaluation as AssessmentEvaluation | null;
            return `Assessment: ${a.assessment.title} (${a.assessment.type})\nScore: ${a.score}/${eval_?.totalPoints ?? 100}`;
          }).join("\n---\n")
        : undefined;

      const prompt = interviewScorecardAnalyzerPromptWithContext({
        scorecards: scorecardsText,
        roleCompetencies: competenciesText,
        candidateContext: candidateContext ?? "Unknown candidate",
        interviewType: interview.interviewType ?? "general",
        transcript: interview.transcript ?? undefined,
        assessments: assessmentText,
      });
      const result = await generate({
        agent: interviewScorecardAnalyzerAgent,
        prompt,
        output: interviewScorecardAnalysisSchema,
      });
      synthesisResult = (result as any).object;
    }

    // 5. Build assessment results (from already-evaluated intelligence, no LLM call)
    const assessmentResults = attempts.map((a) => {
      const eval_ = a.intelligence?.evaluation as AssessmentEvaluation | null;
      return {
        assessmentName: a.assessment.title,
        score: a.score ?? 0,
        maxScore: eval_?.totalPoints ?? 100,
        type: a.assessment.type,
        keyFindings: Object.keys(eval_?.details ?? {}),
      };
    });

    // 6. Merge into InterviewEvaluation
    const tr = transcriptResult as any;
    const sr = synthesisResult as any;

    const evaluation: InterviewEvaluation = {
      topicsDiscussed: tr?.topicsDiscussed ?? [],
      transcriptCompetencyScores: tr?.competencyScores ?? [],
      keyInsights: tr?.keyInsights ?? [],
      alignmentByCompetency: sr?.alignmentByCompetency ?? [],
      evidenceCoverage: sr?.evidenceCoverage ?? 0,
      assessmentParagraph: sr?.assessmentParagraph ?? "",
      panelHealth: sr?.panelHealth ?? "insufficient",
      consensus: sr?.consensus ?? "",
      redFlags: [...(tr?.redFlags ?? []), ...(sr?.redFlags ?? [])],
      standoutMoments: [...(tr?.standoutMoments ?? []), ...(sr?.standoutMoments ?? [])],
      assessmentResults,
      evidenceSources: [
        ...(hasTranscript ? ["transcript" as const] : []),
        ...(hasScorecards ? ["scorecards" as const] : []),
        ...(hasAssessments ? ["assessments" as const] : []),
      ],
    };

    // 7. Save
    const intelRecord = await upsertIntelligence(interviewId, organizationId, {
      evaluation,
      evaluationCount: 1, // upsertIntelligence uses atomic SQL increment
      lastEvaluatedAt: new Date(),
    });
    log.setOutput("interview_intelligence", intelRecord.id, intelRecord.action);

    return {
      success: true,
      evidenceSources: evaluation.evidenceSources,
      panelHealth: evaluation.panelHealth,
    };
  });
}

// -- interview.evaluateMatchForInterview ----------------------------------

export async function evaluateMatchForInterview(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
}) {
  const { organizationId, entityId, traceId } = params;

  const intel = await db.query.interviewIntelligence.findFirst({
    where: eq(interviewIntelligence.id, entityId),
  });
  if (!intel) return { skipped: true, reason: "intel_not_found" };

  const interview = await db.query.interviews.findFirst({
    where: eq(interviews.id, intel.interviewId),
  });
  if (!interview) return { skipped: true, reason: "interview_not_found" };

  // Import dynamically to avoid circular dependency
  const { evaluateMatchForApplication } = await import("./match");
  return evaluateMatchForApplication({
    organizationId,
    entityId: interview.applicationId,
    traceId,
  });
}

// -- interview.transcribe --------------------------------------------------
// Live transcription is now handled by the voice worker in transcription mode.
// The worker joins the LiveKit room, VAD-detects speech per participant,
// sends segments to Groq STT with speaker attribution, and saves the
// diarized transcript when all participants disconnect.
// See: scripts/voice-worker.ts handleTranscriptionSession()

// -- interview.evaluateTranscriptAssessments ------------------------------
// When an interview's transcript becomes available, fire assessmentEvaluate
// for every transcript-evidenced attempt linked to this interview. The
// evaluator pulls the transcript and scores each scenario against its rubric.

export async function evaluateTranscriptAssessmentsForInterview(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
}) {
  const { organizationId, entityId, traceId } = params;

  const attempts = await db.query.assessmentAttempts.findMany({
    where: and(
      eq(assessmentAttempts.interviewId, entityId),
      eq(assessmentAttempts.organizationId, organizationId),
    ),
  });
  if (attempts.length === 0) return { skipped: true, reason: "no_attached_attempts" };

  const { assessmentEvaluate } = await import("./assessment");
  const results: Array<{ attemptId: string; result: unknown }> = [];

  for (const attempt of attempts) {
    const assessment = await db.query.assessments.findFirst({
      where: eq(assessments.id, attempt.assessmentId),
    });
    if (assessment?.type !== "interview_rubric") continue;
    if (attempt.status === "evaluated") continue;

    const result = await assessmentEvaluate({ organizationId, entityId: attempt.id, traceId });
    results.push({ attemptId: attempt.id, result });
  }

  return { evaluated: results.length, attemptCount: attempts.length };
}

// -- interview.schedule (placeholder) -------------------------------------

async function interviewSchedule(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
}) {
  const { entityId } = params;
  return { skipped: true, reason: "calendar_sync_not_implemented", interviewId: entityId };
}
