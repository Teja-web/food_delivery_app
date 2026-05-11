/**
 * Scheduled triage tasks — deterministic queries that detect actionable items.
 * Each task: delete stale items of its type → insert fresh ones. Snapshot, not accumulate.
 *
 * Triggered via pg_cron → pgmq → worker rule "scheduled:daily_triage".
 */

import { db } from "@/db/client";
import { applications, interviews, scorecards, offers, triageItems, roles, candidates, memberProfiles, organization, referrals } from "@/db/schema";
import { eq, and, lt, gte, inArray, sql, not } from "drizzle-orm";
import { generate } from "@/lib/ai";
import { recruiterBriefingAgent, recruiterBriefingSchema } from "../agents/definitions/recruiter-briefing";
import { recruiterBriefingPromptWithContext } from "../agents/prompts/recruiter-briefing";

// -- Helpers --------------------------------------------------------------

/** Delete all active triage items of a given type for an org, then insert fresh ones. */
async function replaceTriageItems(
  organizationId: string,
  type: string,
  items: Array<{
    urgency: string;
    title: string;
    subtitle?: string | null;
    roleId?: string | null;
    candidateId?: string | null;
    interviewId?: string | null;
    applicationId?: string | null;
    action: string;
  }>,
) {
  // Delete stale
  await db.delete(triageItems).where(
    and(
      eq(triageItems.organizationId, organizationId),
      eq(triageItems.type, type),
      eq(triageItems.status, "active"),
    ),
  );

  // Insert fresh
  if (items.length > 0) {
    await db.insert(triageItems).values(
      items.map((item) => ({
        organizationId,
        type,
        urgency: item.urgency,
        title: item.title,
        subtitle: item.subtitle ?? null,
        roleId: item.roleId ?? null,
        candidateId: item.candidateId ?? null,
        interviewId: item.interviewId ?? null,
        applicationId: item.applicationId ?? null,
        action: item.action,
        status: "active" as const,
      })),
    );
  }
}

// -- Stall detection ------------------------------------------------------

const STALL_THRESHOLDS: Record<string, number> = {
  sourced: 7,
  interview: 10,
  offer: 7,
};

async function scheduledStallDetection(params: {
  organizationId: string;
  traceId?: string;
}) {
  const { organizationId } = params;
  const now = Date.now();

  const entries = await db.query.applications.findMany({
    where: eq(applications.organizationId, organizationId),
    with: { candidate: true },
  });

  const items: Array<{ urgency: string; title: string; subtitle: string; roleId: string; candidateId: string; applicationId: string; action: string }> = [];

  for (const entry of entries) {
    if (["hired", "rejected", "withdrawn"].includes(entry.stage)) continue;

    const threshold = STALL_THRESHOLDS[entry.stage] ?? 14;
    const daysSinceUpdate = (now - entry.updatedAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceUpdate > threshold) {
      const days = Math.round(daysSinceUpdate);
      const name = entry.candidate?.name ?? "Unknown candidate";
      items.push({
        urgency: daysSinceUpdate > threshold * 2 ? "high" : "medium",
        title: `${name} stalled in ${entry.stage} for ${days} days`,
        subtitle: `Threshold: ${threshold} days`,
        roleId: entry.roleId,
        candidateId: entry.candidateId,
        applicationId: entry.id,
        action: `Advance or reject ${name}`,
      });
    }
  }

  await replaceTriageItems(organizationId, "stalled_candidate", items);
  return { success: true, count: items.length };
}

// -- Scorecard reminders --------------------------------------------------

async function scheduledScorecardReminders(params: {
  organizationId: string;
  traceId?: string;
}) {
  const { organizationId } = params;

  const completedInterviews = await db.query.interviews.findMany({
    where: and(
      eq(interviews.organizationId, organizationId),
      eq(interviews.status, "completed"),
    ),
    with: { scorecards: true, application: { with: { candidate: true } }, panelists: { with: { user: true } } },
  });

  const items: Array<{ urgency: string; title: string; subtitle: string; roleId: string | null; candidateId: string | null; interviewId: string; applicationId: string; action: string }> = [];

  for (const interview of completedInterviews) {
    if (interview.scorecards && interview.scorecards.length > 0) continue;

    const daysSince = interview.scheduledAt
      ? (Date.now() - interview.scheduledAt.getTime()) / (1000 * 60 * 60 * 24)
      : 0;

    if (daysSince > 1) {
      const days = Math.round(daysSince);
      const candidateName = interview.application?.candidate?.name ?? "Unknown";
      items.push({
        urgency: daysSince > 3 ? "high" : "medium",
        title: `Scorecard overdue from ${(interview as any).panelists?.map((p: any) => p.user?.name).filter(Boolean).join(", ") || "panel"} for ${candidateName}`,
        subtitle: `${days} days since interview`,
        roleId: interview.roleId,
        candidateId: interview.candidateId,
        interviewId: interview.id,
        applicationId: interview.applicationId,
        action: `Send reminder to ${(interview as any).panelists?.map((p: any) => p.user?.name).filter(Boolean).join(", ") || "panel"}`,
      });
    }
  }

  await replaceTriageItems(organizationId, "overdue_scorecard", items);
  return { success: true, count: items.length };
}

// -- Expiring offers ------------------------------------------------------

async function scheduledExpiringOffers(params: {
  organizationId: string;
  traceId?: string;
}) {
  const { organizationId } = params;

  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  const expiringOffers = await db.query.offers.findMany({
    where: and(
      eq(offers.organizationId, organizationId),
      eq(offers.status, "sent"),
    ),
    with: { application: { with: { candidate: true, role: true } } },
  });

  const items: Array<{ urgency: string; title: string; subtitle: string; roleId: string | null; candidateId: string | null; applicationId: string | null; action: string }> = [];

  for (const offer of expiringOffers) {
    if (!offer.validUntil) continue;

    const daysUntilExpiry = (offer.validUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysUntilExpiry > 3) continue;

    const days = Math.max(0, Math.round(daysUntilExpiry));
    const candidateName = offer.application?.candidate?.name ?? "Unknown";
    const roleName = offer.application?.role?.title ?? "Unknown role";

    items.push({
      urgency: days <= 1 ? "critical" : "high",
      title: days === 0
        ? `Offer to ${candidateName} (${roleName}) expires today`
        : `Offer to ${candidateName} (${roleName}) expires in ${days} day${days > 1 ? "s" : ""}`,
      subtitle: `Valid until ${offer.validUntil.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      roleId: offer.roleId,
      candidateId: offer.candidateId,
      applicationId: offer.applicationId,
      action: `Follow up with ${candidateName}`,
    });
  }

  await replaceTriageItems(organizationId, "expiring_offer", items);
  return { success: true, count: items.length };
}

// -- Empty interview slates -----------------------------------------------

async function scheduledEmptyInterviewSlates(params: {
  organizationId: string;
  traceId?: string;
}) {
  const { organizationId } = params;

  const interviewStageApps = await db.query.applications.findMany({
    where: and(
      eq(applications.organizationId, organizationId),
      eq(applications.stage, "interview"),
    ),
    with: { candidate: true, interviews: true },
  });

  const items: Array<{ urgency: string; title: string; subtitle: string; roleId: string; candidateId: string; applicationId: string; action: string }> = [];

  for (const app of interviewStageApps) {
    const scheduledInterviews = (app.interviews ?? []).filter((i) => i.status === "proposed" || i.status === "confirmed");
    if (scheduledInterviews.length > 0) continue;

    const candidateName = app.candidate?.name ?? "Unknown";
    const daysInStage = Math.round((Date.now() - app.updatedAt.getTime()) / (1000 * 60 * 60 * 24));

    items.push({
      urgency: daysInStage > 5 ? "high" : "medium",
      title: `No interviews scheduled for ${candidateName}`,
      subtitle: `In interview stage for ${daysInStage} days`,
      roleId: app.roleId,
      candidateId: app.candidateId,
      applicationId: app.id,
      action: `Schedule interview for ${candidateName}`,
    });
  }

  await replaceTriageItems(organizationId, "no_interviews_scheduled", items);
  return { success: true, count: items.length };
}

// -- Candidate conflicts --------------------------------------------------

async function scheduledCandidateConflicts(params: {
  organizationId: string;
  traceId?: string;
}) {
  const { organizationId } = params;

  const activeApps = await db.query.applications.findMany({
    where: eq(applications.organizationId, organizationId),
    with: { candidate: true, role: true },
  });

  // Group by candidateId, keep only active stages
  const byCandidate = new Map<string, typeof activeApps>();
  for (const app of activeApps) {
    if (["hired", "rejected", "withdrawn"].includes(app.stage)) continue;
    const existing = byCandidate.get(app.candidateId) ?? [];
    existing.push(app);
    byCandidate.set(app.candidateId, existing);
  }

  const items: Array<{ urgency: string; title: string; subtitle: string; candidateId: string; action: string }> = [];

  for (const [candidateId, apps] of byCandidate) {
    if (apps.length < 2) continue;

    const candidateName = apps[0].candidate?.name ?? "Unknown";
    const roleNames = apps.map((a) => a.role?.title ?? "Unknown").join(", ");

    items.push({
      urgency: "medium",
      title: `${candidateName} is in pipeline for ${apps.length} roles`,
      subtitle: roleNames,
      candidateId,
      action: `Prioritize which role to advance ${candidateName} for`,
    });
  }

  await replaceTriageItems(organizationId, "candidate_conflict", items);
  return { success: true, count: items.length };
}

// -- Recruiter daily briefing ---------------------------------------------

async function scheduledRecruiterBriefing(params: {
  organizationId: string;
  traceId?: string;
}) {
  const { organizationId } = params;

  // Find all recruiters in this org
  const recruiters = await db.query.memberProfiles.findMany({
    where: and(
      eq(memberProfiles.organizationId, organizationId),
      eq(memberProfiles.recruitRole, "recruiter"),
    ),
  });

  for (const recruiter of recruiters) {
    // Fetch this recruiter's roles
    const recruiterRoles = await db.query.roles.findMany({
      where: and(
        eq(roles.organizationId, organizationId),
        eq(roles.recruiterId, recruiter.userId),
        eq(roles.status, "open"),
      ),
    });

    if (recruiterRoles.length === 0) continue;

    const roleIds = recruiterRoles.map((r) => r.id);

    // Fetch all active triage items for these roles
    const roleTriageItems = await db
      .select()
      .from(triageItems)
      .where(
        and(
          eq(triageItems.organizationId, organizationId),
          eq(triageItems.status, "active"),
          inArray(triageItems.roleId, roleIds),
        ),
      );

    // Build context for LLM
    const rolesContext = recruiterRoles.map((r) => {
      const roleItems = roleTriageItems.filter((t) => t.roleId === r.id);
      const itemsSummary = roleItems.length > 0
        ? roleItems.map((t) => `  - [${t.urgency}] ${t.title}`).join("\n")
        : "  No issues";
      return `${r.title} (${r.health ?? "unknown"} health, ${r.id}):\n${itemsSummary}`;
    }).join("\n\n");

    const prompt = recruiterBriefingPromptWithContext({
      roleCount: recruiterRoles.length,
      triageItemCount: roleTriageItems.length,
      criticalCount: roleTriageItems.filter((t) => t.urgency === "critical").length,
      highCount: roleTriageItems.filter((t) => t.urgency === "high").length,
      rolesWithItems: rolesContext,
    });

    const result = await generate({ agent: recruiterBriefingAgent, prompt, output: recruiterBriefingSchema });
    const output = (result as any).object as typeof recruiterBriefingSchema._output;

    // Upsert briefing as a triage item scoped to this recruiter
    // Use candidateId field to store the recruiter's userId for scoping
    const existing = await db.select({ id: triageItems.id })
      .from(triageItems)
      .where(and(
        eq(triageItems.organizationId, organizationId),
        eq(triageItems.type, "daily_briefing"),
        eq(triageItems.candidateId, recruiter.userId),
        eq(triageItems.status, "active"),
      ))
      .limit(1);

    if (existing.length > 0) {
      await db.update(triageItems)
        .set({ title: output.briefing, updatedAt: new Date() })
        .where(eq(triageItems.id, existing[0].id));
    } else {
      await db.insert(triageItems).values({
        organizationId,
        type: "daily_briefing",
        urgency: "low",
        title: output.briefing,
        candidateId: recruiter.userId,
        status: "active",
      });
    }
  }

  return { success: true };
}

// -- Orchestrator ---------------------------------------------------------

/**
 * Global sweep — flip referrals to status='expired' once their TTL has passed.
 *
 * Referrals are issuer-scoped (issuedByUserId, optional issuedByOrgId), not
 * cleanly org-scoped — a portal-only candidate's referral has issuedByOrgId
 * NULL. Running per-org would miss those. One global UPDATE per day is cheap
 * and exhaustive.
 *
 * `validateReferral` and `claimReferralAtomic` already reject expired rows
 * via the `expires_at > now()` predicate, so this is purely cosmetic — it
 * keeps the issuer's `/refer` listing accurate so users see "expired"
 * instead of "active" for past-TTL rows.
 */
async function scheduledReferralExpiry() {
  const result = await db
    .update(referrals)
    .set({ status: "expired" })
    .where(
      and(
        eq(referrals.status, "active"),
        sql`${referrals.expiresAt} < NOW()`,
      ),
    )
    .returning({ id: referrals.id });
  return { expired: result.length };
}

export async function scheduledDailyTriage(params: {
  organizationId: string;
  entityId?: string;
  traceId?: string;
}) {
  const { organizationId, traceId } = params;

  // If organizationId is "*", run for all orgs
  const orgIds: string[] = [];
  if (organizationId === "*") {
    const orgs = await db.select({ id: organization.id }).from(organization);
    orgIds.push(...orgs.map((o) => o.id));
  } else {
    orgIds.push(organizationId);
  }

  // Global passes — once per invocation, not per-org.
  if (organizationId === "*") {
    await scheduledReferralExpiry();
  }

  for (const orgId of orgIds) {
    const p = { organizationId: orgId, traceId };
    await scheduledStallDetection(p);
    await scheduledScorecardReminders(p);
    await scheduledExpiringOffers(p);
    await scheduledEmptyInterviewSlates(p);
    await scheduledCandidateConflicts(p);
    await scheduledRecruiterBriefing(p);
  }

  return { success: true, orgCount: orgIds.length };
}
