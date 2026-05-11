/**
 * Rule-based nudge generator for candidate portal.
 *
 * Evaluates candidate state and produces contextual nudges.
 * Deduplicates against existing undismissed nudges.
 * Throttled to run at most once per hour per candidate.
 */

import { db } from "@/db/client";
import { and, eq, isNull, desc, sql } from "drizzle-orm";
import { candidateNudges } from "@/db/schema/candidate-nudges";
import type { NudgeType, NewCandidateNudge } from "@/db/schema/candidate-nudges";

interface CandidateState {
  candidateId: string;
  organizationId: string;
  upcomingInterviews: Array<{
    interviewId: string;
    roleId: string;
    jobTitle: string;
    scheduledAt: string;
  }>;
  recentPrepDate: string | null; // ISO date of most recent prep session
  currentStreak: number;
  completedInterviewsWithEval: Array<{
    interviewId: string;
    roleId: string;
    jobTitle: string;
  }>;
}

interface NudgeCandidate {
  type: NudgeType;
  title: string;
  message: string;
  actionUrl: string;
  priority: number;
}

const THROTTLE_MS = 60 * 60 * 1000; // 1 hour

export async function generateAndStoreNudges(state: CandidateState) {
  const { candidateId, organizationId } = state;

  // Throttle — check if we generated nudges recently
  const recentNudge = await db.query.candidateNudges.findFirst({
    where: eq(candidateNudges.candidateId, candidateId),
    orderBy: desc(candidateNudges.createdAt),
    columns: { createdAt: true },
  });

  if (recentNudge && Date.now() - new Date(recentNudge.createdAt).getTime() < THROTTLE_MS) {
    return; // throttled
  }

  // Get existing undismissed nudge types to avoid duplicates
  const existingNudges = await db
    .select({ type: candidateNudges.type })
    .from(candidateNudges)
    .where(and(
      eq(candidateNudges.candidateId, candidateId),
      isNull(candidateNudges.dismissedAt),
    ));
  const existingTypes = new Set(existingNudges.map((n) => n.type));

  const candidates: NudgeCandidate[] = [];
  const now = new Date();

  // Rule 1: Interview in < 48h, no recent prep
  for (const iv of state.upcomingInterviews) {
    const scheduled = new Date(iv.scheduledAt);
    const hoursUntil = (scheduled.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntil > 0 && hoursUntil < 48) {
      const hasRecentPrep = state.recentPrepDate &&
        (now.getTime() - new Date(state.recentPrepDate).getTime()) < 24 * 60 * 60 * 1000;
      if (!hasRecentPrep) {
        candidates.push({
          type: "interview_prep",
          title: `Prep for ${iv.jobTitle}`,
          message: `Your interview is ${hoursUntil < 24 ? "tomorrow" : "in 2 days"}. A quick practice session can make a difference.`,
          actionUrl: `/prepare?role=${iv.roleId}`,
          priority: 1,
        });
      }
    }
  }

  // Rule 2: Prep streak broken (> 3 days since last session)
  if (state.recentPrepDate && state.currentStreak === 0) {
    const daysSinceLast = (now.getTime() - new Date(state.recentPrepDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLast > 3 && daysSinceLast < 14) {
      candidates.push({
        type: "streak_broken",
        title: "Keep your momentum going",
        message: `It's been ${Math.floor(daysSinceLast)} days since your last prep session. A quick round keeps your skills sharp.`,
        actionUrl: "/prep",
        priority: 3,
      });
    }
  }

  // Rule 3: Post-interview evaluation ready
  for (const iv of state.completedInterviewsWithEval) {
    candidates.push({
      type: "evaluation_ready",
      title: `Feedback ready: ${iv.jobTitle}`,
      message: "Your interview feedback is available. See how you did and what to focus on next.",
      actionUrl: `/roles/${iv.roleId}/interviews`,
      priority: 2,
    });
  }

  // Filter out duplicates
  const newNudges = candidates.filter((n) => !existingTypes.has(n.type));

  if (newNudges.length === 0) return;

  // Insert
  const values: NewCandidateNudge[] = newNudges.map((n) => ({
    organizationId,
    candidateId,
    type: n.type,
    title: n.title,
    message: n.message,
    actionUrl: n.actionUrl,
    priority: n.priority,
  }));

  await db.insert(candidateNudges).values(values);
}

export async function listActiveNudges(candidateId: string) {
  return db
    .select()
    .from(candidateNudges)
    .where(and(
      eq(candidateNudges.candidateId, candidateId),
      isNull(candidateNudges.dismissedAt),
    ))
    .orderBy(candidateNudges.priority, desc(candidateNudges.createdAt))
    .limit(5);
}

export async function dismissNudge(candidateId: string, nudgeId: string) {
  await db
    .update(candidateNudges)
    .set({ dismissedAt: new Date() })
    .where(and(
      eq(candidateNudges.id, nudgeId),
      eq(candidateNudges.candidateId, candidateId),
    ));
}
