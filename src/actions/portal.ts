"use server";

import type { OfferCompState, OfferDeclineReason } from "@/db/schema/offers";
import { requireCandidateContext, requireOrgContext } from "@/lib/auth/context";
import { revalidatePath } from "next/cache";
import {
  createPortalRoleInterest,
  ensurePortalCandidate,
  getExistingApplicationsForCandidate,
  getPortalOpportunity,
  getPortalProfile,
  getPortalInterview,
  listPortalInterviews,
  listPortalOpportunities,
  listPortalPastApplications,
  listPortalPrepHistory,
  getPortalPulseStats,
  setPortalOpportunityWithdrawn,
  setPortalCandidateStatus,
  updatePortalProfile,
  uploadAndExtractResume,
  listPortalAssessments,
  getPortalAssessmentAttempt,
  startPublicAssessment,
} from "@/operations/portal";

export async function fetchPortalOffersDetail() {
  const ctx = await requireCandidateContext();
  const { listPortalOffersWithDetail } = await import("@/operations/portal");
  return listPortalOffersWithDetail(ctx.email);
}

/**
 * Update the candidate's `kind` discriminator. Mutable any time.
 * Drives matcher routing + Explore nav visibility.
 */
export async function updateCandidateKind(
  kind: "professional" | "student" | "early_career",
) {
  const ctx = await requireCandidateContext();
  if (ctx.linkedCandidates.length === 0) throw new Error("No linked candidate");
  const candidate = ctx.linkedCandidates[0]!;
  const { db } = await import("@/db/client");
  const { candidates } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  await db
    .update(candidates)
    .set({ kind, updatedAt: new Date() })
    .where(eq(candidates.id, candidate.id));
  revalidatePath("/profile", "page");
  revalidatePath("/dashboard", "page");
  revalidatePath("/explore", "page");
}

/**
 * Update the student-profile sub-object on candidates.profile JSON.
 * Validated against studentProfileSchema; writes through updatePortalProfile.
 */
export async function updateStudentProfile(input: unknown) {
  const ctx = await requireCandidateContext();
  const profile = await getPortalProfile(ctx.email);
  if (!profile) throw new Error("No linked candidate profile");
  const { studentProfileSchema } = await import("@/domain/portal/student-profile");
  const parsed = studentProfileSchema.partial().parse(input);
  const existing = (profile.candidate.profile ?? {}) as Record<string, unknown>;
  const existingStudent = (existing.studentProfile ?? {}) as Record<string, unknown>;
  await updatePortalProfile({
    candidateId: profile.primaryCandidateId,
    profile: {
      ...existing,
      studentProfile: { ...existingStudent, ...parsed },
    },
  });
  revalidatePath("/profile", "page");
  revalidatePath("/explore", "page");
}

/**
 * AI-driven career-path explorer for the /explore page. Reads the
 * candidate's student profile + legacy fields and runs the LLM agent.
 * Returns null when no candidate or profile has nothing usable.
 */
export async function fetchCareerPaths() {
  const ctx = await requireCandidateContext();
  if (ctx.linkedCandidates.length === 0) return null;
  const candidate = ctx.linkedCandidates[0]!;
  const { generateCareerPaths } = await import("@/operations/career-paths");
  const profile = await getPortalProfile(ctx.email);
  if (!profile) return null;
  const cand = profile.candidate;
  const candProfile = (cand.profile ?? {}) as Record<string, unknown>;
  const studentProfile = (candProfile.studentProfile ?? null) as
    | Record<string, unknown>
    | null;
  return generateCareerPaths({
    candidateName: cand.name ?? ctx.email,
    studentProfile: studentProfile as never,
    legacySkills: (cand.skills as string[] | null) ?? [],
    legacyTitle: cand.title ?? null,
    legacyResumeText: cand.resumeText ?? null,
  });
}

/**
 * Mark the welcome flow complete and stamp initial preferences on the
 * candidate profile. Idempotent; safe to call from a "skip" path with
 * empty inputs.
 */
export async function completeOnboarding(input: {
  situation?: string;
  targetFunctions?: string[];
  targetLocations?: string[];
}) {
  const ctx = await requireCandidateContext();
  const { db } = await import("@/db/client");
  const { user } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  await db
    .update(user)
    .set({ hasCompletedOnboarding: true, updatedAt: new Date() })
    .where(eq(user.id, ctx.userId));

  const hasPreferences =
    Boolean(input.situation) ||
    (input.targetFunctions && input.targetFunctions.length > 0) ||
    (input.targetLocations && input.targetLocations.length > 0);

  if (ctx.linkedCandidates.length > 0 && hasPreferences) {
    const profile = await getPortalProfile(ctx.email);
    if (profile) {
      const existingProfile =
        (profile.candidate.profile ?? {}) as Record<string, unknown>;
      await updatePortalProfile({
        candidateId: profile.primaryCandidateId,
        profile: {
          ...existingProfile,
          ...(input.situation ? { situation: input.situation } : {}),
          ...(input.targetFunctions && input.targetFunctions.length > 0
            ? { targetFunctions: input.targetFunctions }
            : {}),
          ...(input.targetLocations && input.targetLocations.length > 0
            ? { targetLocations: input.targetLocations }
            : {}),
        },
      });
    }
  }

  revalidatePath("/dashboard", "page");
}

export async function fetchPortalProfile() {
  const ctx = await requireCandidateContext();
  // Ensure candidate record exists on every profile fetch
  await ensurePortalCandidate(ctx.email, ctx.name ?? "");

  // activeOrganizationId is now set by requireCandidateContext()

  const profile = await getPortalProfile(ctx.email);

  // Fire-and-forget: refresh advisory if stale or missing (checks recommendations table)
  if (profile && ctx.linkedCandidates.length > 0) {
    const { getLatestAdvisory, generateCandidateAdvisory } = await import("@/domain/portal/advisory");
    const candidate = ctx.linkedCandidates[0]!;

    getLatestAdvisory(candidate.id).then((latest) => {
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      const isStale = !latest || !latest.createdAt || (Date.now() - new Date(latest.createdAt).getTime()) > ONE_DAY_MS;
      // Skip if the candidate has no owning org yet (portal-only). Phase 2
      // will route the advisory through a role/interview-derived org.
      if (isStale && candidate.organizationId) {
        generateCandidateAdvisory({
          organizationId: candidate.organizationId,
          candidateId: candidate.id,
        }).catch((e) => console.error("[portal] Advisory generation failed", { candidateId: candidate.id, error: e }));
      }
    }).catch((e) => console.error("[portal] Advisory staleness check failed", { error: e }));
  }

  return profile;
}

export async function editPortalProfile(data: Record<string, unknown>) {
  const ctx = await requireCandidateContext();
  const profile = await getPortalProfile(ctx.email);
  if (!profile) throw new Error("No linked candidate profile");

  return updatePortalProfile({
    ...data,
    candidateId: profile.primaryCandidateId,
  });
}

export async function deactivatePortalProfile() {
  const ctx = await requireCandidateContext();
  const profile = await getPortalProfile(ctx.email);
  if (!profile) throw new Error("No linked candidate profile");
  return setPortalCandidateStatus(profile.primaryCandidateId, "inactive");
}

export async function reactivatePortalProfile() {
  const ctx = await requireCandidateContext();
  const profile = await getPortalProfile(ctx.email);
  if (!profile) throw new Error("No linked candidate profile");
  return setPortalCandidateStatus(profile.primaryCandidateId, "active");
}

export async function fetchPortalOpportunities() {
  const ctx = await requireCandidateContext();
  return listPortalOpportunities(ctx.email);
}

/**
 * Fetch past/closed applications (rejected, withdrawn, declined offers).
 */
export async function fetchPortalPastApplications() {
  const ctx = await requireCandidateContext();
  return listPortalPastApplications(ctx.email);
}

async function fetchPortalOpportunity(applicationId: string) {
  const ctx = await requireCandidateContext();
  return getPortalOpportunity(ctx.email, applicationId);
}

async function withdrawPortalOpportunity(applicationId: string) {
  const ctx = await requireCandidateContext();
  return setPortalOpportunityWithdrawn(ctx.email, applicationId);
}

export async function fetchPortalInterviews() {
  const ctx = await requireCandidateContext();
  return listPortalInterviews(ctx.email);
}

export async function fetchPortalInterview(interviewId: string) {
  const ctx = await requireCandidateContext();
  return getPortalInterview(ctx.email, interviewId);
}

export async function fetchPortalPrepHistory() {
  const ctx = await requireCandidateContext();
  if (ctx.linkedCandidates.length === 0) return [];
  return listPortalPrepHistory(ctx.linkedCandidates[0]!.id);
}

async function fetchLatestPracticeAttempt() {
  const ctx = await requireCandidateContext();
  const candidateIds = ctx.linkedCandidates.map((c) => c.id);
  const { getLatestPracticeAttempt } = await import("@/operations/portal");
  return getLatestPracticeAttempt(candidateIds);
}

export async function fetchPortalAttempt(attemptId: string) {
  const ctx = await requireCandidateContext();
  const candidateIds = ctx.linkedCandidates.map((c) => c.id);
  const { getPortalAttemptWithQuestions } = await import("@/operations/portal");
  const attempt = await getPortalAttemptWithQuestions(candidateIds, attemptId);
  if (!attempt) throw new Error("Attempt not found or access denied");
  return attempt;
}

export async function savePortalAssessmentDraft(attemptId: string, answers: Record<string, string>) {
  const ctx = await requireCandidateContext();
  const candidateIds = ctx.linkedCandidates.map((c) => c.id);
  const { getPortalAttemptWithQuestions } = await import("@/operations/portal");
  const attempt = await getPortalAttemptWithQuestions(candidateIds, attemptId);
  if (!attempt) throw new Error("Attempt not found or access denied");

  const { buildScopedContext, runWithContext } = await import("@/lib/auth/context");
  const { saveAssessmentDraft } = await import("@/operations/assessments");
  const scopedCtx = buildScopedContext(attempt.organizationId, { id: ctx.userId, name: ctx.name ?? "Candidate" });
  await runWithContext(scopedCtx, () => saveAssessmentDraft(attemptId, answers));
}

export async function submitPortalPracticeAnswers(attemptId: string, answers: Record<string, string>) {
  const ctx = await requireCandidateContext();
  if (ctx.linkedCandidates.length === 0) throw new Error("No linked candidate");

  // Get the attempt's actual org ID (may differ from candidate's org)
  const candidateIds = ctx.linkedCandidates.map((c) => c.id);
  const { getPortalAttemptWithQuestions } = await import("@/operations/portal");
  const attempt = await getPortalAttemptWithQuestions(candidateIds, attemptId);
  if (!attempt) throw new Error("Attempt not found or access denied");

  const { submitPracticeAnswers } = await import("@/domain/portal/prep");
  await submitPracticeAnswers({ attemptId, organizationId: attempt.organizationId, answers });
}

export async function endMockInterviewSession(
  interviewId: string,
  transcript: Array<{ role: string; content: string }>,
  durationSeconds?: number,
) {
  const ctx = await requireCandidateContext();
  const primary = ctx.linkedCandidates[0];
  if (!primary) throw new Error("No linked candidate");

  // Derive org from the interview, not the candidate's creator stamp. The
  // interview's hiring org is the right billing/scope value (vendor-and-
  // attribution-plan Phase 1).
  const { db } = await import("@/db/client");
  const { interviews } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const interview = await db.query.interviews.findFirst({
    where: eq(interviews.id, interviewId),
    columns: { organizationId: true },
  });
  if (!interview) throw new Error("Interview not found");

  const { saveMockSession } = await import("@/operations/portal");
  return saveMockSession({
    organizationId: interview.organizationId,
    interviewId,
    candidateId: primary.id,
    type: "mock_interview",
    transcript: transcript.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    durationSeconds,
  });
}

export async function fetchMockSession(sessionId: string) {
  const ctx = await requireCandidateContext();
  const primary = ctx.linkedCandidates[0];
  if (!primary) throw new Error("No linked candidate");

  const { getMockSession } = await import("@/operations/portal");
  const session = await getMockSession(sessionId, primary.id);
  if (!session) throw new Error("Session not found or access denied");
  return session;
}

export async function submitMockSessionAnswers(
  sessionId: string,
  answers: Array<{ index: number; answer: string }>,
) {
  const ctx = await requireCandidateContext();
  const primary = ctx.linkedCandidates[0];
  if (!primary) throw new Error("No linked candidate");

  const { submitMockSessionAnswers: submit } = await import("@/operations/portal");
  return submit(sessionId, primary.id, answers);
}

/**
 * Upload resume and extract text (fast). Returns candidateId for follow-up intake call.
 */
export async function uploadPortalResume(formData: FormData) {
  const ctx = await requireCandidateContext();
  if (ctx.linkedCandidates.length === 0) throw new Error("No linked candidate");

  const file = formData.get("resume") as File | null;
  if (!file) throw new Error("No resume file provided");

  const candidate = ctx.linkedCandidates[0]!;
  // Upload context is the candidate, not their creator org. Portal-only
  // candidates (no owning org) get a per-candidate storage namespace.
  const uploadOrg = candidate.organizationId ?? `portal-${candidate.id}`;
  const result = await uploadAndExtractResume(file, candidate.id, uploadOrg);
  revalidatePath("/profile", "page");
  return result;
}

async function fetchRecommendedRoles() {
  const ctx = await requireCandidateContext();
  const { getRecommendedRoles } = await import("@/domain/portal/opportunities");
  return getRecommendedRoles(ctx.email);
}

export async function fetchPortalCandidateMatches() {
  const ctx = await requireCandidateContext();
  if (ctx.linkedCandidates.length === 0) return null;
  const { getPortalCandidateMatches } = await import("@/operations/portal");
  return getPortalCandidateMatches(ctx.linkedCandidates[0]!.id);
}

export async function dismissPortalMatchAction(jobId: string, jobTitle: string) {
  const ctx = await requireCandidateContext();
  if (ctx.linkedCandidates.length === 0) throw new Error("No linked candidate");
  const { dismissPortalMatch } = await import("@/operations/portal");
  return dismissPortalMatch(ctx.linkedCandidates[0]!.id, jobId, jobTitle);
}

/**
 * Trigger candidate matching against open roles.
 * Returns candidate ID and match results.
 */
async function dispatchPortalCandidateMatching() {
  const ctx = await requireCandidateContext();
  if (ctx.linkedCandidates.length === 0) throw new Error("No linked candidate");

  const candidate = ctx.linkedCandidates[0]!;
  // Portal-only candidates (no owning org) have no roles to match against
  // until an org adopts them. Skip rather than dispatch an unscoped task.
  if (!candidate.organizationId) {
    return { candidateId: candidate.id, matched: 0, skipped: "no_owning_org" as const };
  }
  const { evaluateMatchesForCandidate } = await import("@/automations/tasks/match");

  const result = await evaluateMatchesForCandidate({
    organizationId: candidate.organizationId,
    entityId: candidate.id,
  });

  return { candidateId: candidate.id, ...result };
}

async function getPortalCandidateId() {
  const ctx = await requireCandidateContext();
  if (ctx.linkedCandidates.length === 0) return null;
  return ctx.linkedCandidates[0]!.id;
}

export async function fetchPortalPulseStats() {
  const ctx = await requireCandidateContext();
  return getPortalPulseStats(ctx.email);
}

export async function fetchPortalGrowthTimeline() {
  const ctx = await requireCandidateContext();
  const candidateIds = ctx.linkedCandidates.map((c) => c.id);
  const { getPortalGrowthTimeline } = await import("@/operations/portal");
  return getPortalGrowthTimeline(candidateIds);
}

export async function fetchPortalNudges() {
  const ctx = await requireCandidateContext();
  if (ctx.linkedCandidates.length === 0) return [];
  const { listActiveNudges } = await import("@/domain/portal/nudges");
  return listActiveNudges(ctx.linkedCandidates[0]!.id);
}

export async function dismissPortalNudge(nudgeId: string) {
  const ctx = await requireCandidateContext();
  if (ctx.linkedCandidates.length === 0) return;
  const { dismissNudge } = await import("@/domain/portal/nudges");
  await dismissNudge(ctx.linkedCandidates[0]!.id, nudgeId);
}

export async function refreshPortalNudges() {
  const ctx = await requireCandidateContext();
  const primary = ctx.linkedCandidates[0];
  if (!primary) return;

  const { generateAndStoreNudges } = await import("@/domain/portal/nudges");
  const { listPortalInterviews, listPortalPrepHistory, getPortalPulseStats } = await import("@/operations/portal");

  const [interviews, prepHistory, stats] = await Promise.all([
    listPortalInterviews(ctx.email),
    listPortalPrepHistory(primary.id),
    getPortalPulseStats(ctx.email),
  ]);

  const now = new Date();
  const upcomingInterviews = interviews
    .filter((iv) => {
      const scheduled = iv.scheduledAt ? new Date(iv.scheduledAt as unknown as string) : null;
      return scheduled && scheduled > now && iv.status === "confirmed";
    })
    .map((iv) => ({
      interviewId: iv.interviewId,
      roleId: iv.jobId,
      jobTitle: iv.jobTitle ?? "Role",
      scheduledAt: iv.scheduledAt ? new Date(iv.scheduledAt as unknown as string).toISOString() : "",
    }));

  const completedInterviewsWithEval = interviews
    .filter((iv) => iv.status === "completed" && iv.evaluation)
    .map((iv) => ({
      interviewId: iv.interviewId,
      roleId: iv.jobId,
      jobTitle: iv.jobTitle ?? "Role",
    }));

  const recentPrepDate = prepHistory.length > 0
    ? (prepHistory[0]!.createdAt instanceof Date
        ? prepHistory[0]!.createdAt.toISOString()
        : prepHistory[0]!.createdAt)
    : null;

  // Skip nudges for portal-only candidates (no owning org); Phase 2 will
  // route nudges through a role/interview-derived org instead.
  if (!primary.organizationId) return;

  await generateAndStoreNudges({
    candidateId: primary.id,
    organizationId: primary.organizationId,
    upcomingInterviews,
    recentPrepDate,
    currentStreak: stats.currentStreak,
    completedInterviewsWithEval,
  });
}

export async function expressInterestInRole(jobId: string) {
  const ctx = await requireCandidateContext();
  if (ctx.linkedCandidates.length === 0) throw new Error("No linked candidate");
  const candidate = ctx.linkedCandidates[0]!;
  // Operation derives org from the role itself; no need to forward the
  // candidate's creator stamp.
  return createPortalRoleInterest(candidate.id, jobId);
}

export async function fetchCandidateApplicationJobs() {
  const ctx = await requireCandidateContext();
  if (ctx.linkedCandidates.length === 0) return [];
  return getExistingApplicationsForCandidate(ctx.linkedCandidates[0]!.id);
}

export async function portalSignOut() {
  const { cookies } = await import("next/headers");
  const { redirect } = await import("next/navigation");

  // Clear session cookies
  const cookieStore = await cookies();
  const sessionCookies = ['better-auth.session_token', 'better-auth.session', 'session_token'];
  for (const cookieName of sessionCookies) {
    try {
      cookieStore.delete(cookieName);
    } catch (error) {
      console.error(`[portalSignOut] Failed to delete cookie ${cookieName}:`, error);
    }
  }

  redirect("/auth/sign-in?mode=candidate");
}

// --- Portal Assessment Actions ----------------------------------------------

export async function fetchPortalAssessments() {
  const ctx = await requireCandidateContext();
  const candidateIds = ctx.linkedCandidates.map((c) => c.id);
  return listPortalAssessments(candidateIds);
}

async function fetchPortalAssessmentAttempt(attemptId: string) {
  const ctx = await requireCandidateContext();
  const candidateIds = ctx.linkedCandidates.map((c) => c.id);
  const attempt = await getPortalAssessmentAttempt(candidateIds, attemptId);
  if (!attempt) throw new Error("Assessment not found or access denied");
  return attempt;
}

export async function fetchPortalAssessmentResults(attemptId: string) {
  const ctx = await requireCandidateContext();
  const candidateIds = ctx.linkedCandidates.map((c) => c.id);
  const attempt = await getPortalAssessmentAttempt(candidateIds, attemptId);
  if (!attempt) throw new Error("Assessment not found or access denied");

  // Fetch questions for this assessment (strip sensitive fields for portal)
  const { getAssessmentQuestions } = await import("@/operations/assessments");
  const questions = await getAssessmentQuestions(attempt.assessmentId);

  // Strip rubric and correctAnswer from questions for candidate view
  const safeQuestions = questions.map(({ correctAnswer, rubric, ...q }) => q);

  return { attempt, questions: safeQuestions };
}

export async function beginPublicAssessment(assessmentId: string) {
  const ctx = await requireCandidateContext();
  if (ctx.linkedCandidates.length === 0) throw new Error("No linked candidate");
  const candidate = ctx.linkedCandidates[0]!;
  // Operation derives org from the assessment row.
  return startPublicAssessment(candidate.id, assessmentId);
}

export async function updateNotificationPreferencesAction(notifications: Record<string, boolean>) {
  const ctx = await requireCandidateContext();
  if (ctx.linkedCandidates.length === 0) throw new Error("No linked candidate");
  const { updateNotificationPreferences } = await import("@/domain/portal/profile");
  return updateNotificationPreferences(ctx.linkedCandidates[0]!.id, notifications);
}

export async function fetchPortalAdvisory() {
  const ctx = await requireCandidateContext();
  if (ctx.linkedCandidates.length === 0) return null;
  const { getLatestAdvisory } = await import("@/domain/portal/advisory");
  return getLatestAdvisory(ctx.linkedCandidates[0]!.id);
}

// --- Portal Offer Actions ---------------------------------------------------

export async function fetchPortalOffer(applicationId: string) {
  const ctx = await requireCandidateContext();
  if (ctx.linkedCandidates.length === 0) return null;
  const candidateIds = ctx.linkedCandidates.map((c) => c.id);
  const { getPortalOfferForApplication } = await import("@/operations/portal");
  return getPortalOfferForApplication(candidateIds, applicationId);
}

export async function acceptPortalOffer(applicationId: string) {
  const ctx = await requireCandidateContext();
  if (ctx.linkedCandidates.length === 0) throw new Error("No linked candidate");

  const candidateIds = ctx.linkedCandidates.map((c) => c.id);
  const { acceptOffer } = await import("@/operations/portal");
  const result = await acceptOffer(candidateIds, applicationId);
  revalidatePath("/roles/[roleId]/offer", "page");
  return result;
}

export async function declinePortalOffer(applicationId: string, declineReason?: OfferDeclineReason) {
  const ctx = await requireCandidateContext();
  if (ctx.linkedCandidates.length === 0) throw new Error("No linked candidate");

  const candidateIds = ctx.linkedCandidates.map((c) => c.id);

  const { declineOffer } = await import("@/operations/portal");
  const result = await declineOffer(candidateIds, applicationId, declineReason);
  revalidatePath("/roles/[roleId]/offer", "page");
  return result;
}

export async function counterPortalOffer(applicationId: string, data: { compState: OfferCompState; justification?: string }) {
  const ctx = await requireCandidateContext();
  if (ctx.linkedCandidates.length === 0) throw new Error("No linked candidate");

  const candidateIds = ctx.linkedCandidates.map((c) => c.id);
  const { counterOffer } = await import("@/operations/portal");
  const result = await counterOffer(candidateIds, applicationId, data);
  revalidatePath("/roles/[roleId]/offer", "page");
  return result;
}

// --- Role Detail -----------------------------------------------------------

export async function fetchPortalRoleDetail(jobId: string) {
  const ctx = await requireCandidateContext();
  const { getPortalRoleDetail } = await import("@/operations/portal");
  return getPortalRoleDetail(ctx.email, jobId);
}

/**
 * Fetch role detail including rejected/declined applications (for viewing declined offers).
 */
export async function fetchPortalRoleDetailForOffer(jobId: string) {
  const ctx = await requireCandidateContext();
  const { getPortalRoleDetailForOffer } = await import("@/operations/portal");
  return getPortalRoleDetailForOffer(ctx.email, jobId);
}

export async function fetchPortalInterviewsForRole(jobId: string) {
  const ctx = await requireCandidateContext();
  const { listPortalInterviewsForRole } = await import("@/operations/portal");
  return listPortalInterviewsForRole(ctx.email, jobId);
}
