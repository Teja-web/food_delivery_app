import { cache } from "react";
import { and, desc, eq, inArray, isNotNull, notInArray, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db/client";
import {
  applications,
  assessments,
  assessmentAttempts,
  candidates,
  interviews,
  interviewIntelligence,
  interviewMockSessions,
  matches,
  organization,
  roles as jobs,
} from "@/db/schema";
import type { MockSessionTranscriptEntry } from "@/db/schema/mock-sessions";
import type { OfferCompState, OfferDeclineReason } from "@/db/schema/offers";
import {
  updatePortalProfileSchema,
} from "./schemas";
import { APP_ID } from "@/lib/constants";
import { extractTextFromFile } from "@/lib/markitdown";
import { storeFile, validateResumeFile } from "@/lib/storage";

async function listPortalCandidatesByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];

  // With global email uniqueness, this returns at most one record
  const candidate = await db.query.candidates.findFirst({
    where: sql`lower(${candidates.email}) = ${normalized}`,
  });

  return candidate ? [candidate] : [];
}

export async function getPortalProfile(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const candidate = await db.query.candidates.findFirst({
    where: sql`lower(${candidates.email}) = ${normalized}`,
    with: { intelligence: true },
  });

  if (!candidate) return null;

  return {
    primaryCandidateId: candidate.id,
    name: candidate.name,
    email: candidate.email,
    phone: candidate.phone,
    location: candidate.location,
    resumeUrl: candidate.resumeUrl,
    resumeText: candidate.resumeText,
    tags: candidate.tags ?? [],
    candidate,
  };
}

/**
 * Create or fetch a portal candidate on first login. The creator stamp
 * `candidates.organization_id` is preserved when one already exists; for
 * brand-new portal-only candidates it is left NULL until an org adopts them
 * (visibility is driven by `org_candidates`, not the creator stamp). See
 * docs/vendor-and-attribution-plan.md (Phase 2).
 */
export async function ensurePortalCandidate(email: string, name: string) {
  const normalized = email.trim().toLowerCase();

  const existing = await db.query.candidates.findFirst({
    where: sql`lower(${candidates.email}) = ${normalized}`,
  });
  if (existing) return existing;

  const [created] = await db
    .insert(candidates)
    .values({
      id: nanoid(),
      organizationId: null,
      name: name || normalized,
      email: normalized,
      status: "active",
    })
    .onConflictDoNothing()
    .returning();

  // Race condition: another request created it between our check and insert.
  if (!created) {
    return db.query.candidates.findFirst({
      where: sql`lower(${candidates.email}) = ${normalized}`,
    }) as any;
  }

  return created;
}

export async function updatePortalProfile(input: unknown) {
  const parsed = updatePortalProfileSchema.parse(input);

  const setFields: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.name !== undefined) setFields.name = parsed.name || null;
  if (parsed.phone !== undefined) setFields.phone = parsed.phone || null;
  if (parsed.location !== undefined) setFields.location = parsed.location || null;
  if (parsed.tags !== undefined) setFields.tags = parsed.tags;
  if (parsed.about !== undefined) setFields.about = parsed.about || null;
  if (parsed.profile !== undefined) setFields.profile = parsed.profile;

  const [updated] = await db
    .update(candidates)
    .set(setFields)
    .where(eq(candidates.id, parsed.candidateId))
    .returning();

  return updated ?? null;
}

export async function setPortalCandidateStatus(candidateId: string, status: "active" | "inactive") {
  const [updated] = await db
    .update(candidates)
    .set({ status, updatedAt: new Date() })
    .where(eq(candidates.id, candidateId))
    .returning();

  return updated ?? null;
}

export async function listPortalOpportunities(email: string) {
  return db
    .select({
      applicationId: applications.id,
      candidateId: applications.candidateId,
      organizationId: applications.organizationId,
      stage: applications.stage,
      jobId: applications.roleId,
      jobTitle: jobs.title,
      jobLocation: jobs.location,
      jobDescription: jobs.description,
      orgName: organization.name,
      candidateName: candidates.name,
      // Full match data — same columns the recruiter side uses
      fitScore: matches.fitScore,
      recommendation: matches.recommendation,
      alignment: matches.alignment,
      signal: matches.signal,
      gaps: matches.gaps,
      summary: matches.summary,
    })
    .from(applications)
    .innerJoin(candidates, eq(applications.candidateId, candidates.id))
    .innerJoin(jobs, eq(applications.roleId, jobs.id))
    .leftJoin(organization, eq(jobs.organizationId, organization.id))
    .leftJoin(matches, eq(applications.matchId, matches.id))
    .where(
      and(
        sql`lower(${candidates.email}) = ${email.trim().toLowerCase()}`,
        notInArray(applications.stage, ["rejected", "withdrawn", "hired"])
      )
    )
    .orderBy(desc(applications.updatedAt));
}

/**
 * List past/closed applications (rejected, withdrawn, declined offers).
 * Shown in a separate "Past Applications" section in the portal.
 */
export async function listPortalPastApplications(email: string) {
  const { offers } = await import("@/db/schema/offers");

  return db
    .select({
      applicationId: applications.id,
      candidateId: applications.candidateId,
      organizationId: applications.organizationId,
      stage: applications.stage,
      jobId: applications.roleId,
      jobTitle: jobs.title,
      jobLocation: jobs.location,
      orgName: organization.name,
      updatedAt: applications.updatedAt,
      // Include offer status for context (e.g., "declined offer")
      offerStatus: offers.status,
    })
    .from(applications)
    .innerJoin(candidates, eq(applications.candidateId, candidates.id))
    .innerJoin(jobs, eq(applications.roleId, jobs.id))
    .leftJoin(organization, eq(jobs.organizationId, organization.id))
    .leftJoin(offers, eq(offers.applicationId, applications.id))
    .where(
      and(
        sql`lower(${candidates.email}) = ${email.trim().toLowerCase()}`,
        inArray(applications.stage, ["rejected", "withdrawn"])
      )
    )
    .orderBy(desc(applications.updatedAt));
}

export async function getPortalOpportunity(email: string, applicationId: string) {
  // Import offers table dynamically
  const { offers } = await import("@/db/schema/offers");

  const [row] = await db
    .select({
      applicationId: applications.id,
      candidateId: applications.candidateId,
      organizationId: applications.organizationId,
      stage: applications.stage,
      score: matches.fitScore,
      jobId: applications.roleId,
      jobTitle: jobs.title,
      jobLocation: jobs.location,
      jobDescription: jobs.description,
      jobCriteria: jobs.criteriaConfig,
      jobComp: jobs.compensation,
      matchAnalysis: matches.alignment,
      candidateName: candidates.name,
      candidateProfile: candidates.profile,
      offerStatus: offers.status,
    })
    .from(applications)
    .innerJoin(candidates, eq(applications.candidateId, candidates.id))
    .innerJoin(jobs, eq(applications.roleId, jobs.id))
    .leftJoin(matches, eq(applications.matchId, matches.id))
    .leftJoin(offers, eq(offers.applicationId, applications.id))
    .where(and(
      eq(applications.id, applicationId),
      sql`lower(${candidates.email}) = ${email.trim().toLowerCase()}`,
    ));

  return row ?? null;
}

export async function setPortalOpportunityWithdrawn(email: string, applicationId: string) {
  const portalCandidates = await listPortalCandidatesByEmail(email);
  if (portalCandidates.length === 0) return null;

  const ids = portalCandidates.map((c) => c.id);
  const [updated] = await db
    .update(applications)
    .set({ stage: "withdrawn", updatedAt: new Date() })
    .where(and(
      eq(applications.id, applicationId),
      inArray(applications.candidateId, ids),
    ))
    .returning();

  return updated ?? null;
}

export async function acceptOffer(candidateIds: string[], applicationId: string) {
  // Import offers table dynamically to avoid circular imports
  const { offers } = await import("@/db/schema/offers");

  // Find the offer for this application owned by one of the candidate's profiles
  const [offer] = await db
    .select({ id: offers.id, status: offers.status })
    .from(offers)
    .innerJoin(applications, eq(offers.applicationId, applications.id))
    .where(and(
      eq(applications.id, applicationId),
      inArray(applications.candidateId, candidateIds),
      eq(offers.status, "sent"), // Can only accept a sent offer
    ));

  if (!offer) return null;

  // Update offer status to accepted
  const [updated] = await db
    .update(offers)
    .set({
      status: "accepted",
      acceptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(offers.id, offer.id))
    .returning();

  // Also update application stage to hired
  if (updated) {
    await db
      .update(applications)
      .set({ stage: "hired", updatedAt: new Date() })
      .where(eq(applications.id, applicationId));
  }

  return updated ?? null;
}

export async function declineOffer(candidateIds: string[], applicationId: string, declineReason?: OfferDeclineReason) {
  const { offers } = await import("@/db/schema/offers");

  const [offer] = await db
    .select({ id: offers.id, status: offers.status })
    .from(offers)
    .innerJoin(applications, eq(offers.applicationId, applications.id))
    .where(and(
      eq(applications.id, applicationId),
      inArray(applications.candidateId, candidateIds),
      or(eq(offers.status, "sent"), eq(offers.status, "negotiating")),
    ));

  if (!offer) return null;

  const [updated] = await db
    .update(offers)
    .set({
      status: "declined",
      declinedAt: new Date(),
      updatedAt: new Date(),
      ...(declineReason ? { declineReason } : {}),
    })
    .where(eq(offers.id, offer.id))
    .returning();

  // Update application stage to rejected
  if (updated) {
    await db
      .update(applications)
      .set({ stage: "rejected", updatedAt: new Date() })
      .where(eq(applications.id, applicationId));
  }

  return updated ?? null;
}

export async function getPortalOfferForApplication(candidateIds: string[], applicationId: string) {
  const { offers, offerVersions } = await import("@/db/schema/offers");

  // Find the offer for this application owned by one of the candidate's profiles
  const [offer] = await db
    .select()
    .from(offers)
    .innerJoin(applications, eq(offers.applicationId, applications.id))
    .where(and(
      eq(applications.id, applicationId),
      inArray(applications.candidateId, candidateIds),
    ));

  if (!offer) return null;

  // Get versions
  const versions = await db
    .select()
    .from(offerVersions)
    .where(eq(offerVersions.offerId, offer.offers.id))
    .orderBy(offerVersions.versionNumber);

  return { ...offer.offers, versions };
}

export async function listPortalOffersForCandidate(email: string) {
  const { offers } = await import("@/db/schema/offers");

  return db
    .select({
      offerId: offers.id,
      applicationId: offers.applicationId,
      status: offers.status,
      validUntil: offers.validUntil,
      jobId: jobs.id,
      jobTitle: jobs.title,
      orgName: organization.name,
    })
    .from(offers)
    .innerJoin(applications, eq(offers.applicationId, applications.id))
    .innerJoin(candidates, eq(applications.candidateId, candidates.id))
    .innerJoin(jobs, eq(applications.roleId, jobs.id))
    .leftJoin(organization, eq(jobs.organizationId, organization.id))
    .where(sql`lower(${candidates.email}) = ${email.trim().toLowerCase()}`)
    .orderBy(desc(offers.createdAt));
}

/**
 * Rich offer view for the candidate-side /offers compare page. Includes
 * comp components, location, role function fields needed for side-by-side.
 */
export async function listPortalOffersWithDetail(email: string) {
  const { offers } = await import("@/db/schema/offers");
  return db
    .select({
      offerId: offers.id,
      applicationId: offers.applicationId,
      status: offers.status,
      validUntil: offers.validUntil,
      sentAt: offers.sentAt,
      compBase: offers.compBase,
      compEquity: offers.compEquity,
      compBonus: offers.compBonus,
      compensation: offers.compensation,
      startDate: offers.startDate,
      jobId: jobs.id,
      jobTitle: jobs.title,
      jobLocation: jobs.location,
      jobEmploymentType: jobs.employmentType,
      orgName: organization.name,
      orgWebsite: organization.website,
    })
    .from(offers)
    .innerJoin(applications, eq(offers.applicationId, applications.id))
    .innerJoin(candidates, eq(applications.candidateId, candidates.id))
    .innerJoin(jobs, eq(applications.roleId, jobs.id))
    .leftJoin(organization, eq(jobs.organizationId, organization.id))
    .where(sql`lower(${candidates.email}) = ${email.trim().toLowerCase()}`)
    .orderBy(desc(offers.createdAt));
}

export async function counterOffer(
  candidateIds: string[],
  applicationId: string,
  data: { compState: OfferCompState; justification?: string },
) {
  const { offers } = await import("@/db/schema/offers");
  const { createOfferVersion } = await import("@/operations/offers");

  // Find the offer
  const [offer] = await db
    .select({ id: offers.id, status: offers.status, organizationId: offers.organizationId })
    .from(offers)
    .innerJoin(applications, eq(offers.applicationId, applications.id))
    .where(and(
      eq(applications.id, applicationId),
      inArray(applications.candidateId, candidateIds),
      eq(offers.status, "sent"), // Can only counter a sent offer
    ));

  if (!offer) return null;

  // Create version with candidate_counter trigger
  const version = await createOfferVersion(offer.id, offer.organizationId, {
    triggerType: "candidate_counter",
    compState: data.compState,
    justification: data.justification,
    createdBy: "candidate",
  });

  // Set status to negotiating
  await db
    .update(offers)
    .set({ status: "negotiating", updatedAt: new Date() })
    .where(eq(offers.id, offer.id));

  return version;
}

export async function listPortalInterviews(email: string) {
  return db
    .select({
      interviewId: interviews.id,
      applicationId: interviews.applicationId,
      scheduledAt: interviews.scheduledAt,
      status: interviews.status,
      meetingLink: interviews.meetingLink,
      location: interviews.location,
      durationMins: interviews.durationMins,
      proposedSlots: interviews.proposedSlots,
      candidateToken: interviews.candidateToken,
      jobId: jobs.id,
      jobTitle: jobs.title,
      organizationId: applications.organizationId,
      candidateId: applications.candidateId,
      evaluation: interviewIntelligence.evaluation,
    })
    .from(interviews)
    .innerJoin(applications, eq(interviews.applicationId, applications.id))
    .innerJoin(candidates, eq(applications.candidateId, candidates.id))
    .innerJoin(jobs, eq(applications.roleId, jobs.id))
    .leftJoin(interviewIntelligence, eq(interviewIntelligence.interviewId, interviews.id))
    .where(sql`lower(${candidates.email}) = ${email.trim().toLowerCase()}`)
    .orderBy(desc(interviews.scheduledAt));
}

export async function getPortalInterview(email: string, interviewId: string) {
  const [row] = await db
    .select({
      interviewId: interviews.id,
      applicationId: interviews.applicationId,
      scheduledAt: interviews.scheduledAt,
      status: interviews.status,
      durationMins: interviews.durationMins,
      meetingLink: interviews.meetingLink,
      location: interviews.location,
      candidateName: candidates.name,
      jobId: jobs.id,
      jobTitle: jobs.title,
      jobDescription: jobs.description,
      organizationId: applications.organizationId,
      candidateId: applications.candidateId,
    })
    .from(interviews)
    .innerJoin(applications, eq(interviews.applicationId, applications.id))
    .innerJoin(candidates, eq(applications.candidateId, candidates.id))
    .innerJoin(jobs, eq(applications.roleId, jobs.id))
    .where(and(
      eq(interviews.id, interviewId),
      sql`lower(${candidates.email}) = ${email.trim().toLowerCase()}`,
    ));

  return row ?? null;
}

/**
 * Upload resume and trigger candidate intake processing.
 * Saves file content as resumeText on candidate, then calls candidateIntake task.
 */
export async function uploadAndExtractResume(file: File, candidateId: string, organizationId: string) {
  validateResumeFile(file);

  // Store file and extract text using markitdown (supports PDF, DOCX, etc.)
  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await storeFile(organizationId, "uploads", file.name, buffer);
  const extracted = await extractTextFromFile(stored.path);
  const text = extracted.text;
  if (!text.trim()) throw new Error("Empty resume file");

  // Update candidate with resume text and public URL
  await db
    .update(candidates)
    .set({
      resumeText: text,
      resumeUrl: stored.url,
      updatedAt: new Date(),
    })
    .where(eq(candidates.id, candidateId));

  return { success: true, candidateId };
}

export async function createPortalRoleInterest(candidateId: string, jobId: string) {
  // Check for existing application
  const existing = await db.query.applications.findFirst({
    where: and(
      eq(applications.candidateId, candidateId),
      eq(applications.roleId, jobId),
    ),
  });

  if (existing) return { existing: true, application: existing };

  // Use the job's organizationId so the application is visible to recruiters
  const job = await db.query.roles.findFirst({
    where: eq(jobs.id, jobId),
    columns: { organizationId: true },
  });
  if (!job) throw new Error("Job not found");

  const [created] = await db.insert(applications).values({
    id: nanoid(),
    organizationId: job.organizationId,
    roleId: jobId,
    candidateId,
    stage: "sourced",
    actorType: "portal",
  }).returning();

  return { existing: false, application: created };
}

export async function getExistingApplicationsForCandidate(candidateId: string) {
  const rows = await db
    .select({ jobId: applications.roleId, stage: applications.stage })
    .from(applications)
    .where(eq(applications.candidateId, candidateId));

  return rows;
}

export async function listOpenRoles() {
  return db
    .select({
      id: jobs.id,
      organizationId: jobs.organizationId,
      title: jobs.title,
      department: jobs.department,
      description: jobs.description,
      location: jobs.location,
      employmentType: jobs.employmentType,
      comp: jobs.compensation,
      criteria: jobs.criteriaConfig,
    })
    .from(jobs)
    .where(sql`${jobs.status} NOT IN ('draft', 'closed', 'archived')`)
    .orderBy(desc(jobs.createdAt));
}

/**
 * Get candidate matches from the matches table.
 * Returns matches with role details, sorted by fitScore descending.
 */
export async function getPortalCandidateMatches(candidateId: string) {
  const rows = await db
    .select({
      matchId: matches.id,
      roleId: matches.roleId,
      fitScore: matches.fitScore,
      recommendation: matches.recommendation,
      signal: matches.signal,
      gaps: matches.gaps,
      summary: matches.summary,
      status: matches.status,
      lastEvaluatedAt: matches.lastEvaluatedAt,
      jobTitle: jobs.title,
      jobDescription: jobs.description,
      jobLocation: jobs.location,
      jobDepartment: jobs.department,
      jobComp: jobs.compensation,
      organizationId: jobs.organizationId,
      orgName: organization.name,
    })
    .from(matches)
    .innerJoin(jobs, eq(matches.roleId, jobs.id))
    .leftJoin(organization, eq(jobs.organizationId, organization.id))
    .where(and(
      eq(matches.candidateId, candidateId),
      eq(matches.status, "active"),
    ))
    .orderBy(desc(matches.fitScore));

  if (rows.length === 0) return null;

  return {
    candidateId,
    matches: rows.map((r) => ({
      matchId: r.matchId,
      jobId: r.roleId,
      jobTitle: r.jobTitle,
      jobDescription: r.jobDescription,
      jobLocation: r.jobLocation,
      jobDepartment: r.jobDepartment,
      jobComp: r.jobComp,
      organizationId: r.organizationId,
      orgName: r.orgName,
      fitScore: r.fitScore,
      recommendation: r.recommendation,
      signal: r.signal,
      gaps: r.gaps,
      summary: r.summary,
      lastEvaluatedAt: r.lastEvaluatedAt,
    })),
    evaluatedAt: rows[0]?.lastEvaluatedAt ?? new Date(),
  };
}

/**
 * Dismiss a match by creating a not_interested application and updating match status.
 */
export async function dismissPortalMatch(candidateId: string, jobId: string, _jobTitle: string) {
  // Get the job's organizationId
  const job = await db.query.roles.findFirst({
    where: eq(jobs.id, jobId),
    columns: { organizationId: true },
  });
  if (!job) throw new Error("Job not found");

  // Create not_interested application (or update existing)
  await db.insert(applications).values({
    id: nanoid(),
    organizationId: job.organizationId,
    roleId: jobId,
    candidateId,
    stage: "not_interested",
    actorType: "portal",
  }).onConflictDoNothing();

  // Update match status to dismissed
  await db
    .update(matches)
    .set({ status: "dismissed", dismissedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(matches.roleId, jobId), eq(matches.candidateId, candidateId)));

  // Count remaining active matches
  const remaining = await db
    .select({ count: sql<number>`count(*)` })
    .from(matches)
    .where(and(eq(matches.candidateId, candidateId), eq(matches.status, "active")));

  return { dismissed: jobId, remaining: Number(remaining[0]?.count ?? 0) };
}

// -- Mock sessions ----------------------------------------------

export async function saveMockSession(params: {
  organizationId: string;
  interviewId: string | null;
  roleId?: string | null;
  candidateId: string;
  type: "mock_interview" | "practice" | "rapid_fire";
  transcript?: MockSessionTranscriptEntry[];
  questions?: Array<{ question: string; answer: string; category?: string; hint?: string; whyThisMatters?: string }>;
  durationSeconds?: number;
  status?: "in_progress" | "completed";
}) {
  const id = nanoid();
  await db.insert(interviewMockSessions).values({
    id,
    organizationId: params.organizationId,
    interviewId: params.interviewId,
    roleId: params.roleId ?? null,
    candidateId: params.candidateId,
    type: params.type,
    transcript: params.transcript,
    questions: params.questions,
    durationSeconds: params.durationSeconds,
    status: params.status ?? "completed",
  });
  return { id };
}

export async function getMockSession(sessionId: string, candidateId: string) {
  const session = await db.query.interviewMockSessions.findFirst({
    where: and(
      eq(interviewMockSessions.id, sessionId),
      eq(interviewMockSessions.candidateId, candidateId),
    ),
  });
  return session ?? null;
}

export async function submitMockSessionAnswers(
  sessionId: string,
  candidateId: string,
  answers: Array<{ index: number; answer: string }>,
) {
  const session = await getMockSession(sessionId, candidateId);
  if (!session) throw new Error("Session not found");
  if (!session.questions) throw new Error("No questions in session");

  const updated = [...session.questions];
  for (const a of answers) {
    if (updated[a.index]) {
      updated[a.index] = { ...updated[a.index], answer: a.answer };
    }
  }

  await db
    .update(interviewMockSessions)
    .set({
      questions: updated,
      status: "completed",
    })
    .where(eq(interviewMockSessions.id, sessionId));

  // Fire-and-forget evaluation
  import("@/automations/tasks/mock-session")
    .then(({ evaluateMockSession }) => evaluateMockSession(sessionId))
    .catch((e) => console.error("[mock-session] Evaluation failed:", e));

  return { id: sessionId };
}

// -- Prep history ----------------------------------------------

const AI_ORIGINS = ["ai_practice", "ai_rapid_fire", "ai_mock_interview"] as const;

export async function listPortalPrepHistory(candidateId: string) {
  // Legacy: assessment-based prep sessions
  const legacyRows = await db
    .select({
      id: assessmentAttempts.id,
      type: assessments.origin,
      createdAt: assessmentAttempts.createdAt,
      score: assessmentAttempts.score,
      evaluation: assessmentAttempts.evaluation,
    })
    .from(assessmentAttempts)
    .innerJoin(assessments, eq(assessmentAttempts.assessmentId, assessments.id))
    .where(and(
      eq(assessmentAttempts.candidateId, candidateId),
      inArray(assessments.origin, [...AI_ORIGINS]),
      isNotNull(assessmentAttempts.evaluation),
    ))
    .orderBy(desc(assessmentAttempts.createdAt));

  const legacy = legacyRows.map((r) => {
    const eval_ = r.evaluation as Record<string, unknown> | null;
    const breakdown = (eval_?.breakdown as Array<{ feedback?: string }> | undefined) ?? [];
    const feedbackLines = breakdown
      .map((b) => b.feedback)
      .filter((f): f is string => !!f);

    return {
      id: r.id,
      type: r.type === "ai_mock_interview" ? "mock_interview" as const : "practice_questions" as const,
      createdAt: r.createdAt,
      score: r.score ?? (eval_?.score as number | undefined) ?? null,
      summary: (eval_?.summary as string | undefined) ?? null,
      feedback: feedbackLines,
      roleId: null as string | null,
      interviewId: null as string | null,
    };
  });

  // New: interview_mock_sessions
  const mockRows = await db
    .select({
      id: interviewMockSessions.id,
      type: interviewMockSessions.type,
      createdAt: interviewMockSessions.createdAt,
      score: interviewMockSessions.score,
      evaluation: interviewMockSessions.evaluation,
      roleId: interviewMockSessions.roleId,
      interviewId: interviewMockSessions.interviewId,
    })
    .from(interviewMockSessions)
    .where(eq(interviewMockSessions.candidateId, candidateId))
    .orderBy(desc(interviewMockSessions.createdAt));

  const mock = mockRows.map((r) => {
    const eval_ = r.evaluation as Record<string, unknown> | null;
    return {
      id: r.id,
      type: r.type === "mock_interview" ? "mock_interview" as const : "practice_questions" as const,
      createdAt: r.createdAt,
      score: r.score ?? (eval_?.readinessScore as number | undefined) ?? null,
      summary: (eval_?.summary as string | undefined) ?? null,
      feedback: (eval_?.improvements as string[] | undefined) ?? [],
      roleId: r.roleId ?? null,
      interviewId: r.interviewId ?? null,
    };
  });

  // Merge and sort by date
  return [...legacy, ...mock].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function getPortalPulseStats(email: string) {
  const normalized = email.trim().toLowerCase();

  // Get candidate IDs for this email
  const candidate = await db.query.candidates.findFirst({
    where: sql`lower(${candidates.email}) = ${normalized}`,
    columns: { id: true },
  });

  if (!candidate) {
    return {
      totalInterviews: 0,
      completedInterviews: 0,
      totalPrepSessions: 0,
      interviewTimeline: [],
      currentStreak: 0,
    };
  }

  // Interviews
  const interviewRows = await db
    .select({
      id: interviews.id,
      scheduledAt: interviews.scheduledAt,
      status: interviews.status,
      jobTitle: jobs.title,
    })
    .from(interviews)
    .innerJoin(applications, eq(interviews.applicationId, applications.id))
    .innerJoin(jobs, eq(applications.roleId, jobs.id))
    .where(eq(applications.candidateId, candidate.id))
    .orderBy(desc(interviews.scheduledAt));

  const totalInterviews = interviewRows.length;
  const completedInterviews = interviewRows.filter(
    (iv) => iv.status === "completed" || iv.status === "evaluated"
  ).length;

  const interviewTimeline = interviewRows.map((iv) => ({
    date: iv.scheduledAt ? new Date(iv.scheduledAt).toISOString() : "",
    company: iv.jobTitle ?? "",
    status: iv.status ?? "",
  }));

  // Prep sessions (from assessmentAttempts with AI origins)
  const prepHistory = await listPortalPrepHistory(candidate.id);

  const totalPrepSessions = prepHistory.length;

  // Streak — consecutive days with at least one prep session
  let currentStreak = 0;
  if (prepHistory.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayMs = 86400000;

    const prepDays = new Set(
      prepHistory.map((p) => {
        const d = new Date(p.createdAt);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      })
    );

    let checkDay = today.getTime();
    if (!prepDays.has(checkDay)) {
      checkDay -= dayMs;
    }
    while (prepDays.has(checkDay)) {
      currentStreak++;
      checkDay -= dayMs;
    }
  }

  return {
    totalInterviews,
    completedInterviews,
    totalPrepSessions,
    interviewTimeline,
    currentStreak,
  };
}

// --- Growth Timeline --------------------------------------------------------

export async function getPortalGrowthTimeline(candidateIds: string[]) {
  if (candidateIds.length === 0) return [];

  // Mock sessions with evaluations
  const mockSessions = await db
    .select({
      id: interviewMockSessions.id,
      type: interviewMockSessions.type,
      score: interviewMockSessions.score,
      evaluation: interviewMockSessions.evaluation,
      createdAt: interviewMockSessions.createdAt,
    })
    .from(interviewMockSessions)
    .where(and(
      inArray(interviewMockSessions.candidateId, candidateIds),
      isNotNull(interviewMockSessions.evaluation),
    ))
    .orderBy(desc(interviewMockSessions.createdAt))
    .limit(30);

  // Assessment attempts with scores
  const attempts = await db
    .select({
      id: assessmentAttempts.id,
      score: assessmentAttempts.score,
      createdAt: assessmentAttempts.createdAt,
      title: assessments.title,
    })
    .from(assessmentAttempts)
    .innerJoin(assessments, eq(assessmentAttempts.assessmentId, assessments.id))
    .where(and(
      inArray(assessmentAttempts.candidateId, candidateIds),
      isNotNull(assessmentAttempts.score),
    ))
    .orderBy(desc(assessmentAttempts.createdAt))
    .limit(30);

  // Merge into timeline
  const timeline: Array<{
    id: string;
    source: "prep" | "assessment";
    label: string;
    score: number;
    date: string;
    details?: { readiness?: number; communication?: number; content?: number };
  }> = [];

  for (const s of mockSessions) {
    const ev = s.evaluation as Record<string, unknown> | null;
    timeline.push({
      id: s.id,
      source: "prep",
      label: s.type === "mock_interview" ? "Mock Interview" : s.type === "rapid_fire" ? "Rapid Fire" : "Practice",
      score: s.score ?? 0,
      date: s.createdAt,
      details: ev ? {
        readiness: ev.readinessScore as number | undefined,
        communication: ev.communicationScore as number | undefined,
        content: ev.contentScore as number | undefined,
      } : undefined,
    });
  }

  for (const a of attempts) {
    timeline.push({
      id: a.id,
      source: "assessment",
      label: a.title ?? "Assessment",
      score: a.score ?? 0,
      date: a.createdAt as unknown as string,
    });
  }

  // Sort by date descending
  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return timeline;
}

// --- Portal Assessments -----------------------------------------------------

export async function listPortalAssessments(candidateIds: string[]) {
  if (candidateIds.length === 0) return { assigned: [], available: [] };

  // Assigned: attempts for this candidate (exclude private/prep assessments)
  const allAssigned = await db.query.assessmentAttempts.findMany({
    where: inArray(assessmentAttempts.candidateId, candidateIds),
    with: {
      assessment: { columns: { id: true, title: true, type: true, description: true, origin: true, visibility: true } },
    },
    orderBy: [desc(assessmentAttempts.createdAt)],
  });
  const assigned = allAssigned.filter(
    (a) => a.assessment && a.assessment.visibility !== "private",
  );

  // Available: public assessments the candidate hasn't completed
  const completedIds = assigned
    .filter((a) => a.status === "completed" || a.status === "evaluated")
    .map((a) => a.assessmentId);

  const allPublic = await db.query.assessments.findMany({
    where: and(
      eq(assessments.visibility, "public"),
      eq(assessments.status, "active"),
    ),
  });

  const available = allPublic.filter((a) => !completedIds.includes(a.id));

  return { assigned, available };
}

export async function getPortalAssessmentAttempt(candidateIds: string[], attemptId: string) {
  if (candidateIds.length === 0) return null;

  // Direct query - portal doesn't have org context, so we bypass CRUD and apply row-level security manually
  const attempt = await db.query.assessmentAttempts.findFirst({
    where: and(
      eq(assessmentAttempts.id, attemptId),
      inArray(assessmentAttempts.candidateId, candidateIds), // Row-level security: only owning candidate
    ),
    with: { assessment: true },
  });

  if (!attempt) {
    console.log(`[getPortalAssessmentAttempt] Attempt not found or access denied: ${attemptId}`);
    return null;
  }

  return attempt;
}

async function getPortalAttemptByAssessmentId(candidateIds: string[], assessmentId: string) {
  if (candidateIds.length === 0) return null;

  // Debug: check all attempts for this candidate
  const allAttempts = await db.query.assessmentAttempts.findMany({
    where: inArray(assessmentAttempts.candidateId, candidateIds),
    columns: { id: true, assessmentId: true, status: true },
  });
  console.log("[getPortalAttemptByAssessmentId] All attempts for candidate:", allAttempts);

  // Find the most recent attempt for this assessment by one of the candidate's linked profiles
  const attempt = await db.query.assessmentAttempts.findFirst({
    where: and(
      eq(assessmentAttempts.assessmentId, assessmentId),
      inArray(assessmentAttempts.candidateId, candidateIds),
    ),
    with: { assessment: true },
    orderBy: [desc(assessmentAttempts.createdAt)],
  });

  return attempt ?? null;
}

export async function getLatestPracticeAttempt(candidateIds: string[]) {
  if (candidateIds.length === 0) return null;

  const attempt = await db.query.assessmentAttempts.findFirst({
    where: and(
      inArray(assessmentAttempts.candidateId, candidateIds),
    ),
    with: { assessment: true },
    orderBy: [desc(assessmentAttempts.createdAt)],
  });

  if (!attempt) return null;

  const origin = (attempt.assessment as Record<string, unknown> | null)?.origin as string | undefined;
  if (!origin || !["ai_practice", "ai_rapid_fire"].includes(origin)) return null;

  const { assessmentQuestions } = await import("@/db/schema");
  const questions = await db.query.assessmentQuestions.findMany({
    where: eq(assessmentQuestions.assessmentId, attempt.assessmentId),
    orderBy: (q, { asc }) => [asc(q.order)],
    columns: { id: true, text: true, type: true, order: true, options: true },
  });

  return { ...attempt, questions };
}

export async function getPortalAttemptWithQuestions(candidateIds: string[], attemptId: string) {
  const { assessmentQuestions } = await import("@/db/schema");

  const attempt = await db.query.assessmentAttempts.findFirst({
    where: and(
      eq(assessmentAttempts.id, attemptId),
      inArray(assessmentAttempts.candidateId, candidateIds),
    ),
    with: {
      assessment: true,
    },
  });

  if (!attempt) return null;

  const questions = await db.query.assessmentQuestions.findMany({
    where: eq(assessmentQuestions.assessmentId, attempt.assessmentId),
    orderBy: (q, { asc }) => [asc(q.order)],
    columns: { id: true, text: true, type: true, order: true, options: true },
  });

  return { ...attempt, questions };
}

export async function startPublicAssessment(candidateId: string, assessmentId: string) {
  // Verify assessment is public and active
  const assessment = await db.query.assessments.findFirst({
    where: and(
      eq(assessments.id, assessmentId),
      eq(assessments.visibility, "public"),
      eq(assessments.status, "active"),
    ),
    columns: { id: true, organizationId: true },
  });

  if (!assessment) throw new Error("Assessment not available");

  // Check for existing attempt
  const existing = await db.query.assessmentAttempts.findFirst({
    where: and(
      eq(assessmentAttempts.assessmentId, assessmentId),
      eq(assessmentAttempts.candidateId, candidateId),
    ),
  });

  if (existing) return existing;

  // Org derives from the assessment, not the candidate.
  const [attempt] = await db.insert(assessmentAttempts).values({
    organizationId: assessment.organizationId,
    assessmentId,
    candidateId,
    status: "pending",
  }).returning();

  return attempt;
}

// -- Role detail for portal pipeline ---------------------------------

export async function getPortalRoleDetail(email: string, jobId: string) {
  const normalized = email.trim().toLowerCase();

  // Get application + match + job data for this specific role
  const [appRow] = await db
    .select({
      applicationId: applications.id,
      stage: applications.stage,
      fitScore: matches.fitScore,
      recommendation: matches.recommendation,
      alignment: matches.alignment,
      signal: matches.signal,
      gaps: matches.gaps,
      summary: matches.summary,
      jobTitle: jobs.title,
      jobDescription: jobs.description,
      jobLocation: jobs.location,
      jobDepartment: jobs.department,
      jobEmploymentType: jobs.employmentType,
      jobComp: jobs.compensation,
      candidateId: applications.candidateId,
    })
    .from(applications)
    .innerJoin(candidates, eq(applications.candidateId, candidates.id))
    .innerJoin(jobs, eq(applications.roleId, jobs.id))
    .leftJoin(matches, eq(applications.matchId, matches.id))
    .where(
      and(
        eq(applications.roleId, jobId),
        sql`lower(${candidates.email}) = ${normalized}`,
        notInArray(applications.stage, ["rejected", "withdrawn", "not_interested"]),
      )
    )
    .limit(1);

  // If no application, try match-only (discovered but not applied)
  if (!appRow) {
    const candidate = await db.query.candidates.findFirst({
      where: sql`lower(${candidates.email}) = ${normalized}`,
      columns: { id: true },
    });
    if (!candidate) return null;

    const [matchRow] = await db
      .select({
        fitScore: matches.fitScore,
        recommendation: matches.recommendation,
        alignment: matches.alignment,
        signal: matches.signal,
        gaps: matches.gaps,
        summary: matches.summary,
        jobTitle: jobs.title,
        jobDescription: jobs.description,
        jobLocation: jobs.location,
        jobDepartment: jobs.department,
        jobEmploymentType: jobs.employmentType,
        jobComp: jobs.compensation,
      })
      .from(matches)
      .innerJoin(jobs, eq(matches.roleId, jobs.id))
      .where(
        and(
          eq(matches.roleId, jobId),
          eq(matches.candidateId, candidate.id),
          eq(matches.status, "active"),
        )
      )
      .limit(1);

    if (!matchRow) return null;

    return {
      jobId,
      applicationId: null as string | null,
      candidateId: candidate.id,
      stage: null as string | null,
      ...matchRow,
    };
  }

  return {
    jobId,
    applicationId: appRow.applicationId as string | null,
    candidateId: appRow.candidateId,
    stage: appRow.stage as string | null,
    fitScore: appRow.fitScore,
    recommendation: appRow.recommendation,
    alignment: appRow.alignment,
    signal: appRow.signal,
    gaps: appRow.gaps,
    summary: appRow.summary,
    jobTitle: appRow.jobTitle,
    jobDescription: appRow.jobDescription,
    jobLocation: appRow.jobLocation,
    jobDepartment: appRow.jobDepartment,
    jobEmploymentType: appRow.jobEmploymentType,
    jobComp: appRow.jobComp,
  };
}

/**
 * Get role detail for offer viewing - includes rejected/declined applications
 * so candidates can still see their declined offer status.
 */
export async function getPortalRoleDetailForOffer(email: string, jobId: string) {
  const normalized = email.trim().toLowerCase();

  const [appRow] = await db
    .select({
      applicationId: applications.id,
      stage: applications.stage,
      fitScore: matches.fitScore,
      recommendation: matches.recommendation,
      alignment: matches.alignment,
      signal: matches.signal,
      gaps: matches.gaps,
      summary: matches.summary,
      jobTitle: jobs.title,
      jobDescription: jobs.description,
      jobLocation: jobs.location,
      jobDepartment: jobs.department,
      jobEmploymentType: jobs.employmentType,
      jobComp: jobs.compensation,
      candidateId: applications.candidateId,
    })
    .from(applications)
    .innerJoin(candidates, eq(applications.candidateId, candidates.id))
    .innerJoin(jobs, eq(applications.roleId, jobs.id))
    .leftJoin(matches, eq(applications.matchId, matches.id))
    .where(
      and(
        eq(applications.roleId, jobId),
        sql`lower(${candidates.email}) = ${normalized}`,
        // No stage filter - allow viewing declined offers
      )
    )
    .limit(1);

  if (!appRow) return null;

  return {
    jobId,
    applicationId: appRow.applicationId as string | null,
    candidateId: appRow.candidateId,
    stage: appRow.stage as string | null,
    fitScore: appRow.fitScore,
    recommendation: appRow.recommendation,
    alignment: appRow.alignment,
    signal: appRow.signal,
    gaps: appRow.gaps,
    summary: appRow.summary,
    jobTitle: appRow.jobTitle,
    jobDescription: appRow.jobDescription,
    jobLocation: appRow.jobLocation,
    jobDepartment: appRow.jobDepartment,
    jobEmploymentType: appRow.jobEmploymentType,
    jobComp: appRow.jobComp,
  };
}

export async function listPortalInterviewsForRole(email: string, jobId: string) {
  return db
    .select({
      interviewId: interviews.id,
      applicationId: interviews.applicationId,
      scheduledAt: interviews.scheduledAt,
      status: interviews.status,
      meetingLink: interviews.meetingLink,
      location: interviews.location,
      durationMins: interviews.durationMins,
      proposedSlots: interviews.proposedSlots,
      candidateToken: interviews.candidateToken,
      jobId: jobs.id,
      jobTitle: jobs.title,
      organizationId: applications.organizationId,
      candidateId: applications.candidateId,
      evaluation: interviewIntelligence.evaluation,
    })
    .from(interviews)
    .innerJoin(applications, eq(interviews.applicationId, applications.id))
    .innerJoin(candidates, eq(applications.candidateId, candidates.id))
    .innerJoin(jobs, eq(applications.roleId, jobs.id))
    .leftJoin(interviewIntelligence, eq(interviewIntelligence.interviewId, interviews.id))
    .where(
      and(
        eq(applications.roleId, jobId),
        sql`lower(${candidates.email}) = ${email.trim().toLowerCase()}`,
      )
    )
    .orderBy(desc(interviews.scheduledAt));
}

/* ─────────────────────────────────────────────────────────────
 * Portal candidate context — single composed read used by the
 * (portal)/(protected) layout and any server component below it.
 * Wrapped in React `cache` so multiple call sites in the same
 * request share one execution.
 * ──────────────────────────────────────────────────────────── */

export type PortalCandidateContextValue = {
  candidateId: string | null;
  organizationId: string | null;
  email: string;
  name: string;
  initials: string;
  /** Candidate kind discriminator — drives matcher routing and nav variants. */
  kind: "professional" | "student" | "early_career";
  profile: Awaited<ReturnType<typeof getPortalProfile>>;
  advisory: Awaited<ReturnType<typeof _loadAdvisory>>;
  interviews: Awaited<ReturnType<typeof listPortalInterviews>>;
  applications: Awaited<ReturnType<typeof listPortalOpportunities>>;
  matches: Awaited<ReturnType<typeof getPortalCandidateMatches>> | null;
  nudges: Awaited<ReturnType<typeof _loadNudges>>;
  hasResume: boolean;
  profileCompleteness: number;
};

async function _loadAdvisory(candidateId: string) {
  const { getLatestAdvisory } = await import("@/domain/portal/advisory");
  return getLatestAdvisory(candidateId);
}

async function _loadNudges(candidateId: string) {
  const { listActiveNudges } = await import("@/domain/portal/nudges");
  return listActiveNudges(candidateId);
}

function _computeInitials(nameOrEmail: string): string {
  return nameOrEmail
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export const getPortalCandidateContext = cache(
  async (): Promise<PortalCandidateContextValue> => {
    const { requireCandidateContext } = await import("@/lib/auth/context");
    const ctx = await requireCandidateContext();
    const name = ctx.name ?? "";
    const initials = _computeInitials(name || ctx.email);

    // Bootstrap: every authenticated portal request guarantees a candidate row.
    // First load after sign-up has linkedCandidates=[] until ensurePortalCandidate
    // runs. Re-query afterwards so the rest of the context sees the new row.
    let primary: { id: string; organizationId: string | null } | null =
      ctx.linkedCandidates[0] ?? null;
    if (!primary) {
      await ensurePortalCandidate(ctx.email, name);
      const created = await db.query.candidates.findFirst({
        where: sql`lower(${candidates.email}) = ${ctx.email.trim().toLowerCase()}`,
        columns: { id: true, organizationId: true },
      });
      primary = created ?? null;
    }

    if (!primary) {
      return {
        candidateId: null,
        organizationId: null,
        email: ctx.email,
        name,
        initials,
        kind: "professional",
        profile: null,
        advisory: null,
        interviews: [],
        applications: [],
        matches: null,
        nudges: [],
        hasResume: false,
        profileCompleteness: 0,
      };
    }

    const { profileCompleteness } = await import("@/domain/portal/profile");

    const [profile, advisory, interviewsList, applicationsList, candidateMatches, nudges] =
      await Promise.all([
        getPortalProfile(ctx.email),
        _loadAdvisory(primary.id),
        listPortalInterviews(ctx.email),
        listPortalOpportunities(ctx.email),
        getPortalCandidateMatches(primary.id).catch(() => null),
        _loadNudges(primary.id),
      ]);

    const hasResume = Boolean(profile?.resumeText || profile?.resumeUrl);
    const completeness = profile?.candidate
      ? profileCompleteness(profile.candidate).percentage
      : 0;

    const candidateKind = (profile?.candidate?.kind ?? "professional") as
      | "professional"
      | "student"
      | "early_career";

    return {
      candidateId: primary.id,
      organizationId: primary.organizationId,
      email: ctx.email,
      name,
      initials,
      kind: candidateKind,
      profile,
      advisory,
      interviews: interviewsList,
      applications: applicationsList,
      matches: candidateMatches,
      nudges,
      hasResume,
      profileCompleteness: completeness,
    };
  },
);
