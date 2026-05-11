/**
 * pipeline.score_fit — Score a candidate's fit for a role in the pipeline.
 * pipeline.assign_assessment — Auto-assign assessment when candidate enters a stage.
 * pipeline.update_evidence — Update evidence summary after new data (scorecard, assessment).
 * pipeline.check_decision_readiness — Check if enough evidence exists for a hiring decision.
 */

import { db } from "@/db/client";
import {
  applications,
  interviews,
  scorecards,
  assessments,
  assessmentAttempts,
  applicationIntelligence,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { withExecutionLog } from "@/lib/execution-log";
import { evaluateMatchForApplication } from "./match";

async function upsertApplicationIntelligence(
  applicationId: string,
  organizationId: string,
  data: Partial<typeof applicationIntelligence.$inferInsert>,
) {
  const existing = await db.query.applicationIntelligence.findFirst({
    where: eq(applicationIntelligence.applicationId, applicationId),
  });

  if (existing) {
    await db
      .update(applicationIntelligence)
      .set({ ...data, evaluationCount: existing.evaluationCount + 1, lastEvaluatedAt: new Date(), updatedAt: new Date() })
      .where(eq(applicationIntelligence.id, existing.id));
    return { id: existing.id, action: "updated" as const };
  }

  const id = nanoid();
  await db.insert(applicationIntelligence).values({
    id,
    organizationId,
    applicationId,
    ...data,
  });
  return { id, action: "created" as const };
}

async function pipelineScoreFit(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
}) {
  return evaluateMatchForApplication(params);
}

export async function pipelineAssignAssessment(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
}) {
  const { organizationId, entityId } = params;

  const entry = await db.query.applications.findFirst({
    where: and(eq(applications.id, entityId), eq(applications.organizationId, organizationId)),
  });
  if (!entry) return { skipped: true, reason: "application_not_found" };

  // Find active assessments for this organization
  const activeAssessments = await db.query.assessments.findMany({
    where: and(eq(assessments.organizationId, organizationId), eq(assessments.status, "active")),
  });

  if (activeAssessments.length === 0) return { skipped: true, reason: "no_assessments" };

  // Check if already assigned
  const existing = await db.query.assessmentAttempts.findFirst({
    where: and(
      eq(assessmentAttempts.applicationId, entityId),
      eq(assessmentAttempts.organizationId, organizationId),
    ),
  });
  if (existing) return { skipped: true, reason: "already_assigned" };

  // Assign first matching assessment
  const assessment = activeAssessments[0];
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 7);

  const [attempt] = await db
    .insert(assessmentAttempts)
    .values({
      organizationId,
      assessmentId: assessment.id,
      candidateId: entry.candidateId,
      applicationId: entityId,
      status: "pending",
      deadlineAt: deadline,
    })
    .returning();

  return { success: true, attemptId: attempt.id, assessmentId: assessment.id };
}

export async function pipelineUpdateEvidence(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
}) {
  const { organizationId, entityId, traceId } = params;

  return withExecutionLog(db, {
    taskId: "pipeline-update-evidence",
    organizationId,
    entityType: "application",
    entityId,
    traceId,
  }, async (log) => {
    const entry = await db.query.applications.findFirst({
      where: and(eq(applications.id, entityId), eq(applications.organizationId, organizationId)),
    });
    if (!entry) return { skipped: true, reason: "application_not_found" };

    // Gather all evidence for this pipeline entry
    const entryInterviews = await db.query.interviews.findMany({
      where: eq(interviews.applicationId, entityId),
    });
    const entryAssessments = await db.query.assessmentAttempts.findMany({
      where: eq(assessmentAttempts.applicationId, entityId),
    });

    const interviewCount = entryInterviews.length;
    const completedInterviews = entryInterviews.filter((i) => i.status === "completed").length;
    const assessmentCount = entryAssessments.length;
    const completedAssessments = entryAssessments.filter((a) => a.status === "evaluated").length;

    // Gather scorecard data
    let scorecardCount = 0;
    for (const interview of entryInterviews) {
      const cards = await db.query.scorecards.findMany({
        where: eq(scorecards.interviewId, interview.id),
      });
      scorecardCount += cards.length;
    }

    const evidenceSummary = {
      interviewCount,
      completedInterviews,
      scorecardCount,
      assessmentCount,
      completedAssessments,
      lastUpdated: new Date().toISOString(),
    };

    // Write to application_intelligence table
    const intelRecord = await upsertApplicationIntelligence(entityId, organizationId, {
      evidenceSummary: evidenceSummary as any,
    });
    log.setOutput("application_intelligence", intelRecord.id, intelRecord.action);

    return { success: true, evidence: evidenceSummary };
  });
}

export async function pipelineCheckDecisionReadiness(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
}) {
  const { organizationId, entityId, traceId } = params;

  return withExecutionLog(db, {
    taskId: "pipeline-check-decision-readiness",
    organizationId,
    entityType: "application",
    entityId,
    traceId,
  }, async (log) => {
    const entry = await db.query.applications.findFirst({
      where: and(eq(applications.id, entityId), eq(applications.organizationId, organizationId)),
    });
    if (!entry) return { skipped: true, reason: "application_not_found" };

    // Read from application_intelligence table instead of intel store
    const appIntel = await db.query.applicationIntelligence.findFirst({
      where: eq(applicationIntelligence.applicationId, entityId),
    });

    const evidence = appIntel?.evidenceSummary as Record<string, unknown> | null;
    const fit = appIntel?.fitScore as Record<string, unknown> | null;

    const hasInterviewEvidence = evidence && (evidence.completedInterviews as number) > 0;
    const hasScorecards = evidence && (evidence.scorecardCount as number) > 0;
    const hasFitScore = fit && (fit.score as number) > 0;

    const isReady = Boolean(hasInterviewEvidence && hasScorecards && hasFitScore);
    const gaps: string[] = [];
    if (!hasInterviewEvidence) gaps.push("no_completed_interviews");
    if (!hasScorecards) gaps.push("no_scorecards");
    if (!hasFitScore) gaps.push("no_fit_score");

    // Write decision readiness to application_intelligence
    const intelRecord = await upsertApplicationIntelligence(entityId, organizationId, {
      decisionReadiness: { isReady, gaps, checkedAt: new Date().toISOString() } as any,
    });
    log.setOutput("application_intelligence", intelRecord.id, intelRecord.action);

    return { success: true, isReady, gaps };
  });
}
