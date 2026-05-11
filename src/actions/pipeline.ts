"use server";

import {
  getPipelineEntries as _getPipelineEntries,
  getApplication as _getApplication,
  createApplication as _createApplication,
  updateApplication as _updateApplication,
  deleteApplication as _deleteApplication,
  searchPipelineEntries as _searchPipelineEntries,
  getPipelineStageCounts as _getPipelineStageCounts,
} from "../operations/applications";
import { db } from "@/db/client";
import { applications, matches, candidates, roles, interviewStages } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getActionContext } from "@/lib/auth/context";
import { isTerminalStage, type TerminalStage } from "@/lib/pipeline-stage";
import { revalidatePath } from "next/cache";
import "@/lib/integrations/register-providers";
import { sendEmailViaProvider } from "@/lib/integrations/email";
import { render } from "@react-email/components";
import { InterviewInvitationEmail } from "@/components/emails/interview-invitation";

async function listPipelineEntries(opts?: {
  offset?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  return _getPipelineEntries(opts);
}

export async function listPipelineStageCounts(organizationId: string) {
  return _getPipelineStageCounts(organizationId);
}

async function searchPipelineEntries(query: string, opts?: { offset?: number; limit?: number }) {
  return _searchPipelineEntries(query, opts);
}

async function fetchApplication(id: string) {
  return _getApplication(id);
}

export async function editApplication(id: string, data: Record<string, unknown>) {
  const result = await _updateApplication(id, data);
  revalidatePath("/recruit/roles/[id]", "page");
  return result;
}

async function removeApplication(id: string) {
  return _deleteApplication(id);
}

// -- Stage transition helpers -----------------------------------------

export async function advanceApplication(id: string, toStage: string) {
  const result = await _updateApplication(id, { stage: toStage });
  revalidatePath("/recruit/roles/[id]", "page");
  return result;
}

async function approvePipelineRecommendation(id: string) {
  return _updateApplication(id, { stage: "interview", recommendation: "approved" });
}

// -- Match recommendation actions ------------------------------------

export async function addMatchToPipeline(matchId: string, roleId: string, candidateId: string) {
  const ctx = await getActionContext();

  // Create application in sourced stage
  const app = await _createApplication({
    organizationId: ctx.organizationId,
    roleId,
    candidateId,
    matchId,
    stage: "sourced",
    source: "ai-match",
  });

  // Mark match as converted
  await db.update(matches).set({
    status: "converted",
    updatedAt: new Date(),
  }).where(eq(matches.id, matchId));

  revalidatePath("/roles/[id]", "page");
  revalidatePath("/candidates/[id]", "page");
  return app;
}

export async function findMoreMatches(roleId: string) {
  const ctx = await getActionContext();
  const { evaluateMatchesForRole } = await import("@/automations/tasks/match");
  const result = await evaluateMatchesForRole({
    organizationId: ctx.organizationId,
    entityId: roleId,
  });
  revalidatePath("/roles/[id]", "page");
  return result;
}

export async function dismissMatch(matchId: string) {
  const ctx = await getActionContext();

  await db.update(matches).set({
    status: "dismissed",
    dismissedAt: new Date(),
    dismissedById: ctx.userId,
    updatedAt: new Date(),
  }).where(eq(matches.id, matchId));

  revalidatePath("/roles/[id]", "page");
  revalidatePath("/candidates/[id]", "page");
}

// -- Batch operations -------------------------------------------------
//
// Each batch action runs as a single db.transaction and emits exactly one
// revalidatePath call at the end. Going through pipelineCrud.update would
// fire onMutate (2 revalidations) per row — these actions bypass the
// factory deliberately for that reason.
//
// Terminal-stage moves (rejected/withdrawn/hired) are the only stage
// transitions allowed in bulk. Advance is intentionally per-row only:
// advancing depends on per-candidate context (scheduling, offer drafting)
// that doesn't bulk cleanly.

export type BatchSkipped = { id: string; reason: string };
export type BatchResult<T> = { succeeded: T[]; skipped: BatchSkipped[] };

/**
 * Apply a uniform terminal stage to N applications in one transaction.
 * Skips rows that are already at the target stage (idempotent — no-op skips
 * surface to the caller for honest reporting via UndoToast).
 *
 * Returns { succeeded: [{id, priorStage}], skipped: [{id, reason}] } so undo
 * only reverses the rows that actually moved.
 */
export async function editApplicationsBatch(
  ids: string[],
  data: { stage: TerminalStage },
  _meta?: { reason?: string },
): Promise<BatchResult<{ id: string; priorStage: string }>> {
  if (ids.length === 0) return { succeeded: [], skipped: [] };

  if (!isTerminalStage(data.stage)) {
    throw new Error(`editApplicationsBatch only supports terminal stages, got: ${data.stage}`);
  }

  const ctx = await getActionContext();

  const result = await db.transaction(async (tx) => {
    const prior = await tx
      .select({
        id: applications.id,
        priorStage: applications.stage,
        candidateName: candidates.name,
      })
      .from(applications)
      .leftJoin(candidates, eq(applications.candidateId, candidates.id))
      .where(inArray(applications.id, ids));

    const succeeded: { id: string; priorStage: string }[] = [];
    const skipped: BatchSkipped[] = [];
    const idsToUpdate: string[] = [];

    for (const row of prior) {
      if (row.priorStage === data.stage) {
        skipped.push({ id: row.id, reason: `${row.candidateName ?? "Candidate"} already ${data.stage}` });
      } else {
        succeeded.push({ id: row.id, priorStage: row.priorStage });
        idsToUpdate.push(row.id);
      }
    }

    if (idsToUpdate.length > 0) {
      await tx
        .update(applications)
        .set({
          stage: data.stage,
          ...ctx.auditUpdate(),
        })
        .where(inArray(applications.id, idsToUpdate));
    }

    return { succeeded, skipped };
  });

  revalidatePath("/recruit/roles/[id]", "page");
  return result;
}

/**
 * Bulk match → pipeline conversion. Each new application enters at "sourced".
 * Skips matches that are already converted or dismissed (idempotent).
 *
 * Returns { succeeded: [{applicationId, matchId}], skipped: [{id, reason}] }
 * so the UI can report how many actually transitioned.
 */
export async function addMatchesToPipelineBatch(
  inputs: { matchId: string; roleId: string; candidateId: string }[],
): Promise<BatchResult<{ applicationId: string; matchId: string }>> {
  if (inputs.length === 0) return { succeeded: [], skipped: [] };

  const ctx = await getActionContext();
  const audit = ctx.auditCreate();
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    // Read current match statuses to detect already-handled rows.
    const matchRows = await tx
      .select({ id: matches.id, status: matches.status })
      .from(matches)
      .where(inArray(matches.id, inputs.map((i) => i.matchId)));
    const statusById = new Map(matchRows.map((m) => [m.id, m.status]));

    const skipped: BatchSkipped[] = [];
    const toInsert: typeof inputs = [];
    for (const i of inputs) {
      const status = statusById.get(i.matchId);
      if (status === "converted") {
        skipped.push({ id: i.matchId, reason: "Already in pipeline" });
      } else if (status === "dismissed") {
        skipped.push({ id: i.matchId, reason: "Match was dismissed" });
      } else {
        toInsert.push(i);
      }
    }

    if (toInsert.length === 0) {
      return { succeeded: [], skipped };
    }

    const newApps = toInsert.map((i) => ({
      id: nanoid(),
      organizationId: ctx.organizationId,
      roleId: i.roleId,
      candidateId: i.candidateId,
      matchId: i.matchId,
      stage: "sourced" as const,
      source: "ai-match",
      createdById: audit.createdById,
      createdByName: audit.createdByName,
      updatedById: audit.createdById,
      updatedByName: audit.createdByName,
    }));

    const inserted = await tx
      .insert(applications)
      .values(newApps)
      .returning({ id: applications.id, matchId: applications.matchId });

    await tx
      .update(matches)
      .set({ status: "converted", updatedAt: now })
      .where(inArray(matches.id, toInsert.map((i) => i.matchId)));

    return {
      succeeded: inserted.map((a) => ({
        applicationId: a.id,
        matchId: a.matchId ?? "",
      })),
      skipped,
    };
  });

  revalidatePath("/recruit/roles/[id]", "page");
  revalidatePath("/recruit/candidates/[id]", "page");
  return result;
}

/** Bulk dismiss recommendations. */
export async function dismissMatchesBatch(matchIds: string[]): Promise<void> {
  if (matchIds.length === 0) return;

  const ctx = await getActionContext();
  const now = new Date();

  await db
    .update(matches)
    .set({
      status: "dismissed",
      dismissedAt: now,
      dismissedById: ctx.userId,
      updatedAt: now,
    })
    .where(inArray(matches.id, matchIds));

  revalidatePath("/recruit/roles/[id]", "page");
  revalidatePath("/recruit/candidates/[id]", "page");
}

// -- Interview scheduling ----------------------------------------------
// All interviews start as "proposed". The candidate confirms via their portal.

async function sendInterviewInvitationEmail(
  userId: string,
  candidateEmail: string,
  candidateName: string,
  roleTitle: string,
  stageName: string | null,
  proposedSlots: { startAt: string; endAt: string }[],
  candidateToken: string,
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const confirmUrl = `${baseUrl}/portal/interview/${candidateToken}`;

  const html = await render(
    InterviewInvitationEmail({
      candidateName,
      roleTitle,
      stageName,
      proposedSlots,
      confirmUrl,
    })
  );

  const sent = await sendEmailViaProvider(userId, {
    to: candidateEmail,
    subject: `Interview Invitation: ${roleTitle}${stageName ? ` - ${stageName}` : ""}`,
    html,
  });

  if (!sent) {
    console.warn("[sendInterviewInvitationEmail] No email provider connected for user:", userId);
    throw new Error("No email provider connected. Please connect your email in Settings > Integrations.");
  }
}

export async function proposeAndAdvance(
  applicationId: string,
  stageId: string,
  data: {
    panelistUserIds: string[];
    interviewType?: string;
    proposedSlots: { startAt: string; endAt: string }[];
    durationMins: number;
    meetingLink?: string;
    location?: string;
    evidenceTarget?: string;
    notes?: string;
    proctored?: boolean;
  },
) {
  const ctx = await getActionContext();

  const app = await _getApplication(applicationId);
  if (!app) throw new Error("Application not found");

  // Check for scheduling conflicts with panelists' existing interviews
  let calendarWarnings: Array<{ slot: { startAt: string }; userId: string; busySlots: Array<{ start: string; end: string }> }> = [];

  if (data.panelistUserIds.length > 0 && data.proposedSlots.length > 0) {
    const { checkInterviewConflicts } = await import("@/operations/interviews");
    const conflictResult = await checkInterviewConflicts(
      data.panelistUserIds,
      data.proposedSlots,
      data.durationMins,
    );

    // Hard conflicts with existing Dilliznt interviews - block creation
    if (conflictResult.hasConflict) {
      const conflictDetails = conflictResult.conflicts
        .map((c) => {
          const slotTime = new Date(c.slot.startAt).toLocaleString();
          return `Slot at ${slotTime} conflicts with existing interview`;
        })
        .join("; ");
      throw new Error(`Scheduling conflict detected: ${conflictDetails}. Please choose different time slots.`);
    }

    // Calendar busy warnings - store for return (not blocking)
    calendarWarnings = conflictResult.calendarWarnings;
  }

  // Fetch candidate and role for email notification
  const [candidate, role, stage] = await Promise.all([
    db.query.candidates.findFirst({ where: eq(candidates.id, (app as any).candidateId) }),
    db.query.roles.findFirst({ where: eq(roles.id, (app as any).roleId) }),
    stageId ? db.query.interviewStages.findFirst({ where: eq(interviewStages.id, stageId) }) : null,
  ]);

  const { createInterview } = await import("@/operations/interviews");
  const interview = await createInterview({
    ...ctx.auditCreate(),
    applicationId,
    stageId,
    roleId: (app as any).roleId,
    candidateId: (app as any).candidateId,
    interviewType: data.interviewType ?? "video_call",
    durationMins: data.durationMins,
    meetingLink: data.meetingLink,
    location: data.location,
    evidenceTarget: data.evidenceTarget,
    notes: data.notes,
    proctored: data.proctored ?? false,
    status: "proposed",
    proposedSlots: data.proposedSlots,
    // Set scheduledAt from the first slot for display/sorting purposes
    scheduledAt: new Date(data.proposedSlots[0].startAt),
  });

  // Create panelist rows
  if (data.panelistUserIds.length > 0) {
    const { db } = await import("@/db/client");
    const { interviewPanelists } = await import("@/db/schema");
    const { nanoid } = await import("nanoid");

    await db.insert(interviewPanelists).values(
      data.panelistUserIds.map((userId) => ({
        id: nanoid(),
        interviewId: interview.id,
        userId,
        role: "interviewer",
      })),
    );
  }

  // Advance application to interview stage
  if ((app as any).stage !== "interview") {
    await _updateApplication(applicationId, { stage: "interview" });
  }

  // Send interview invitation email to candidate
  if (candidate?.email && role) {
    try {
      await sendInterviewInvitationEmail(
        ctx.userId,
        candidate.email,
        candidate.name,
        role.title,
        stage?.name ?? null,
        data.proposedSlots,
        interview.candidateToken,
      );
    } catch (error) {
      // Log but don't fail the interview creation if email fails
      console.error("[proposeAndAdvance] Failed to send interview invitation email:", error);
    }
  }

  revalidatePath("/roles/[id]", "page");
  revalidatePath("/interviews", "page");

  // Return interview with calendar warnings if any
  return {
    ...interview,
    calendarWarnings: calendarWarnings.length > 0 ? calendarWarnings.map((w) => ({
      slotTime: new Date(w.slot.startAt).toLocaleString(),
      userId: w.userId,
      busyTimes: w.busySlots.map((b) => `${new Date(b.start).toLocaleTimeString()} - ${new Date(b.end).toLocaleTimeString()}`),
    })) : undefined,
  };
}

// -- Scorecard submission -----------------------------------------------

export async function submitScorecard(
  interviewId: string,
  data: {
    ratings: { competency: string; rating: number; evidence: string }[];
    overallRating: number | null;
    verdict: string | null;
    notes?: string | null;
  },
) {
  const ctx = await getActionContext();

  const { createScorecard, updateScorecard } = await import("@/operations/interviews");
  const { db } = await import("@/db/client");
  const { scorecards } = await import("@/db/schema");
  const { eq, and } = await import("drizzle-orm");

  // Check if scorecard already exists for this reviewer and interview
  const existing = await db.query.scorecards.findFirst({
    where: and(
      eq(scorecards.interviewId, interviewId),
      eq(scorecards.reviewerId, ctx.userId),
    ),
  });

  let scorecard;
  if (existing) {
    // Update existing scorecard
    scorecard = await updateScorecard(existing.id, {
      ratings: data.ratings,
      overallRating: data.overallRating,
      verdict: data.verdict,
      notes: data.notes,
      updatedAt: new Date(),
    });
  } else {
    // Create new scorecard
    scorecard = await createScorecard({
      ...ctx.auditCreate(),
      interviewId,
      reviewerId: ctx.userId,
      reviewerName: ctx.user.name,
      ratings: data.ratings,
      overallRating: data.overallRating,
      verdict: data.verdict,
      notes: data.notes,
    });
  }

  // Mark interview as completed only when verdict is provided (final submit)
  if (data.verdict) {
    const { updateInterview } = await import("@/operations/interviews");
    await updateInterview(interviewId, { status: "completed" });
  }

  revalidatePath("/roles/[id]", "page");
  revalidatePath("/interviews", "page");

  return scorecard;
}
