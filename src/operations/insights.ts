import { db } from "@/db/client";
import { applications } from "@/db/schema/applications";
import { candidates } from "@/db/schema/candidates";
import { roles } from "@/db/schema/roles";
import { matches } from "@/db/schema/matches";
import { offers } from "@/db/schema/offers";
import { interviews, scorecards } from "@/db/schema/interviews";
import { eq, sql, and, gte, inArray } from "drizzle-orm";

/**
 * Get hiring velocity metrics: average time to fill and breakdown by role.
 */
export async function getHiringVelocity(organizationId: string) {
  // Get all hired applications with time-to-fill calculation
  const hiredApps = await db
    .select({
      roleId: applications.roleId,
      roleTitle: roles.title,
      targetHireDate: roles.targetHireDate,
      roleCreatedAt: roles.createdAt,
      createdAt: applications.createdAt,
      hiredAt: applications.hiredAt,
    })
    .from(applications)
    .innerJoin(roles, eq(applications.roleId, roles.id))
    .where(
      and(
        eq(applications.organizationId, organizationId),
        eq(applications.stage, "hired"),
        sql`${applications.hiredAt} IS NOT NULL`
      )
    );

  // Calculate days to fill for each hire
  const hiresWithDays = hiredApps.map((app) => {
    const created = new Date(app.createdAt);
    const hired = app.hiredAt ? new Date(app.hiredAt) : new Date();
    const daysToFill = Math.ceil((hired.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    return { ...app, daysToFill };
  });

  // Overall average
  const avgDaysToFill = hiresWithDays.length > 0
    ? Math.round(hiresWithDays.reduce((sum, h) => sum + h.daysToFill, 0) / hiresWithDays.length)
    : 0;

  // Group by role
  const byRoleMap = new Map<string, { roleTitle: string; target: number; days: number[]; }>();
  for (const hire of hiresWithDays) {
    const existing = byRoleMap.get(hire.roleId);
    if (existing) {
      existing.days.push(hire.daysToFill);
    } else {
      byRoleMap.set(hire.roleId, {
        roleTitle: hire.roleTitle,
        target: hire.targetHireDate && hire.roleCreatedAt
          ? Math.ceil((new Date(hire.targetHireDate).getTime() - new Date(hire.roleCreatedAt).getTime()) / (1000 * 60 * 60 * 24))
          : 60,
        days: [hire.daysToFill],
      });
    }
  }

  const byRole = Array.from(byRoleMap.entries()).map(([roleId, data]) => ({
    roleId,
    role: data.roleTitle,
    days: Math.round(data.days.reduce((a, b) => a + b, 0) / data.days.length),
    target: data.target,
    status: (data.days.reduce((a, b) => a + b, 0) / data.days.length) <= data.target ? "ahead" : "behind",
  }));

  return { avgDaysToFill, target: 30, byRole };
}

/**
 * Get pipeline health: total active candidates and conversion rate.
 */
export async function getPipelineHealth(organizationId: string) {
  // Count active candidates (not rejected, withdrawn, or hired)
  const [activeResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(applications)
    .where(
      and(
        eq(applications.organizationId, organizationId),
        sql`${applications.stage} NOT IN ('rejected', 'withdrawn', 'hired')`
      )
    );

  // Count total sourced
  const [sourcedResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(applications)
    .where(eq(applications.organizationId, organizationId));

  // Count hired
  const [hiredResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(applications)
    .where(
      and(
        eq(applications.organizationId, organizationId),
        eq(applications.stage, "hired")
      )
    );

  // Count open roles
  const [rolesResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(roles)
    .where(
      and(
        eq(roles.organizationId, organizationId),
        eq(roles.status, "open")
      )
    );

  const totalActive = activeResult?.count ?? 0;
  const totalSourced = sourcedResult?.count ?? 0;
  const totalHired = hiredResult?.count ?? 0;
  const openRoles = rolesResult?.count ?? 0;
  const conversionRate = totalSourced > 0 ? Math.round((totalHired / totalSourced) * 1000) / 10 : 0;

  return { totalActive, conversionRate, totalHired, openRoles };
}

/**
 * Get source effectiveness: candidates, hires, conversion rate, avg fit by source.
 */
export async function getSourceEffectiveness(organizationId: string) {
  // Get counts by source
  const sourceCounts = await db
    .select({
      source: applications.source,
      totalCandidates: sql<number>`count(*)::int`,
      hires: sql<number>`count(*) FILTER (WHERE ${applications.stage} = 'hired')::int`,
    })
    .from(applications)
    .where(eq(applications.organizationId, organizationId))
    .groupBy(applications.source);

  // Get average fit scores by source (from matches)
  const fitScores = await db
    .select({
      source: applications.source,
      avgFit: sql<number>`round(avg(${matches.fitScore}))::int`,
    })
    .from(applications)
    .leftJoin(matches, eq(applications.matchId, matches.id))
    .where(
      and(
        eq(applications.organizationId, organizationId),
        sql`${matches.fitScore} IS NOT NULL`
      )
    )
    .groupBy(applications.source);

  const fitMap = new Map(fitScores.map((f) => [f.source, f.avgFit]));

  return sourceCounts.map((s) => ({
    source: s.source ?? "Unknown",
    candidates: s.totalCandidates,
    hires: s.hires,
    conversionRate: s.totalCandidates > 0 ? Math.round((s.hires / s.totalCandidates) * 1000) / 10 : 0,
    avgFit: fitMap.get(s.source) ?? 0,
  }));
}

/**
 * Get recent hires with time-to-fill.
 */
export async function getRecentHires(organizationId: string, limit = 5) {
  const hires = await db
    .select({
      id: applications.id,
      candidateId: applications.candidateId,
      candidateName: candidates.name,
      roleId: applications.roleId,
      roleTitle: roles.title,
      source: applications.source,
      createdAt: applications.createdAt,
      hiredAt: applications.hiredAt,
    })
    .from(applications)
    .innerJoin(candidates, eq(applications.candidateId, candidates.id))
    .innerJoin(roles, eq(applications.roleId, roles.id))
    .where(
      and(
        eq(applications.organizationId, organizationId),
        eq(applications.stage, "hired")
      )
    )
    .orderBy(sql`${applications.hiredAt} DESC NULLS LAST`)
    .limit(limit);

  return hires.map((h) => {
    const created = new Date(h.createdAt);
    const hired = h.hiredAt ? new Date(h.hiredAt) : new Date();
    const daysToFill = Math.ceil((hired.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    return {
      id: h.id,
      name: h.candidateName,
      role: h.roleTitle,
      source: h.source ?? "Unknown",
      daysToFill,
      date: hired.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
  });
}

/**
 * Get roles that may have bottlenecks (stalled pipelines, long open times).
 */
export async function getBottlenecks(organizationId: string) {
  // Get open roles with pipeline stats
  const openRoles = await db
    .select({
      roleId: roles.id,
      roleTitle: roles.title,
      createdAt: roles.createdAt,
      targetHireDate: roles.targetHireDate,
    })
    .from(roles)
    .where(
      and(
        eq(roles.organizationId, organizationId),
        eq(roles.status, "open")
      )
    );

  if (openRoles.length === 0) return [];

  // Get stage counts per role
  const stageCounts = await db
    .select({
      roleId: applications.roleId,
      stage: applications.stage,
      count: sql<number>`count(*)::int`,
    })
    .from(applications)
    .where(
      and(
        eq(applications.organizationId, organizationId),
        inArray(applications.roleId, openRoles.map((r) => r.roleId))
      )
    )
    .groupBy(applications.roleId, applications.stage);

  // Build bottleneck insights
  const bottlenecks: Array<{
    issue: string;
    impact: string;
    suggestion: string;
    urgency: "high" | "medium" | "low";
  }> = [];

  for (const role of openRoles) {
    const daysOpen = Math.ceil((Date.now() - new Date(role.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    const target = role.targetHireDate
      ? Math.ceil((new Date(role.targetHireDate).getTime() - new Date(role.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      : 60;
    const roleStages = stageCounts.filter((s) => s.roleId === role.roleId);

    const sourced = roleStages.find((s) => s.stage === "sourced")?.count ?? 0;
    const interview = roleStages.find((s) => s.stage === "interview")?.count ?? 0;
    const offer = roleStages.find((s) => s.stage === "offer")?.count ?? 0;

    // Role open too long with no progress
    if (daysOpen > target && interview === 0) {
      bottlenecks.push({
        issue: `${role.roleTitle} has been open ${daysOpen} days with no candidates in interview`,
        impact: `Pipeline is top-heavy — ${sourced} sourced but none progressing`,
        suggestion: "Review criteria fit or increase sourcing quality",
        urgency: "high",
      });
    }
    // Role approaching deadline with thin pipeline
    else if (daysOpen > target * 0.7 && offer === 0 && interview < 3) {
      bottlenecks.push({
        issue: `${role.roleTitle} approaching deadline with thin pipeline`,
        impact: `${daysOpen} days open, only ${interview} in interview stage`,
        suggestion: "Accelerate interviews or expand candidate pool",
        urgency: "medium",
      });
    }
  }

  return bottlenecks.slice(0, 4); // Max 4 bottlenecks
}

/**
 * Get overview of open roles with pipeline stage breakdown.
 * Shows useful data even for organizations without any hires yet.
 */
export async function getOpenRolesOverview(organizationId: string) {
  // Get open roles
  const openRoles = await db
    .select({
      id: roles.id,
      title: roles.title,
      department: roles.department,
      createdAt: roles.createdAt,
      targetHireDate: roles.targetHireDate,
    })
    .from(roles)
    .where(
      and(
        eq(roles.organizationId, organizationId),
        eq(roles.status, "open")
      )
    )
    .orderBy(sql`${roles.createdAt} DESC`)
    .limit(10);

  if (openRoles.length === 0) return [];

  // Get stage counts per role
  const stageCounts = await db
    .select({
      roleId: applications.roleId,
      stage: applications.stage,
      count: sql<number>`count(*)::int`,
    })
    .from(applications)
    .where(
      and(
        eq(applications.organizationId, organizationId),
        inArray(applications.roleId, openRoles.map((r) => r.id))
      )
    )
    .groupBy(applications.roleId, applications.stage);

  return openRoles.map((role) => {
    const roleStages = stageCounts.filter((s) => s.roleId === role.id);
    const daysOpen = Math.ceil((Date.now() - new Date(role.createdAt).getTime()) / (1000 * 60 * 60 * 24));

    return {
      id: role.id,
      title: role.title,
      department: role.department,
      daysOpen,
      stages: {
        sourced: roleStages.find((s) => s.stage === "sourced")?.count ?? 0,
        interview: roleStages.find((s) => s.stage === "interview")?.count ?? 0,
        offer: roleStages.find((s) => s.stage === "offer")?.count ?? 0,
        hired: roleStages.find((s) => s.stage === "hired")?.count ?? 0,
      },
      totalCandidates: roleStages.reduce((sum, s) => sum + s.count, 0),
    };
  });
}

/**
 * Get offer acceptance metrics: acceptance rate, decline reasons breakdown, monthly trend.
 */
export async function getOfferAcceptance(organizationId: string) {
  // Count offers by status
  const statusCounts = await db
    .select({
      status: offers.status,
      count: sql<number>`count(*)::int`,
    })
    .from(offers)
    .where(eq(offers.organizationId, organizationId))
    .groupBy(offers.status);

  const sent = statusCounts.reduce((sum, s) => sum + (s.status !== "draft" ? s.count : 0), 0);
  const accepted = statusCounts.find((s) => s.status === "accepted")?.count ?? 0;
  const declined = statusCounts.find((s) => s.status === "declined")?.count ?? 0;
  const withdrawn = statusCounts.find((s) => s.status === "withdrawn")?.count ?? 0;
  const pending = statusCounts.find((s) => s.status === "sent")?.count ?? 0;
  const acceptanceRate = sent > 0 ? Math.round((accepted / sent) * 1000) / 10 : 0;

  // Decline reasons breakdown
  const declinedOffers = await db
    .select({ declineReason: offers.declineReason })
    .from(offers)
    .where(
      and(
        eq(offers.organizationId, organizationId),
        eq(offers.status, "declined"),
        sql`${offers.declineReason} IS NOT NULL`
      )
    );

  const reasonCounts: Record<string, number> = {};
  for (const o of declinedOffers) {
    const reason = (o.declineReason as any)?.reason ?? "other";
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  }
  const declineReasons = Object.entries(reasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  // Monthly trend (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const monthlyOffers = await db
    .select({
      month: sql<string>`to_char(${offers.createdAt}, 'YYYY-MM')`,
      status: offers.status,
      count: sql<number>`count(*)::int`,
    })
    .from(offers)
    .where(
      and(
        eq(offers.organizationId, organizationId),
        gte(offers.createdAt, sixMonthsAgo),
        sql`${offers.status} != 'draft'`
      )
    )
    .groupBy(sql`to_char(${offers.createdAt}, 'YYYY-MM')`, offers.status)
    .orderBy(sql`to_char(${offers.createdAt}, 'YYYY-MM')`);

  const trendMap = new Map<string, { sent: number; accepted: number; declined: number }>();
  for (const row of monthlyOffers) {
    if (!trendMap.has(row.month)) {
      trendMap.set(row.month, { sent: 0, accepted: 0, declined: 0 });
    }
    const entry = trendMap.get(row.month)!;
    entry.sent += row.count;
    if (row.status === "accepted") entry.accepted += row.count;
    if (row.status === "declined") entry.declined += row.count;
  }

  const trend = Array.from(trendMap.entries()).map(([month, data]) => ({
    month,
    ...data,
    rate: data.sent > 0 ? Math.round((data.accepted / data.sent) * 1000) / 10 : 0,
  }));

  return { acceptanceRate, sent, accepted, declined, withdrawn, pending, declineReasons, trend };
}

/**
 * Get interview outcome metrics: advance rate, panel agreement, avg scores by role.
 */
export async function getInterviewOutcomes(organizationId: string) {
  // Total completed interviews
  const [completedResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(interviews)
    .where(
      and(
        eq(interviews.organizationId, organizationId),
        eq(interviews.status, "completed")
      )
    );
  const totalCompleted = completedResult?.count ?? 0;

  // Interview-to-advance rate: completed interviews where the application later reached offer or hired
  const advancedResult = await db
    .select({ count: sql<number>`count(DISTINCT ${interviews.id})::int` })
    .from(interviews)
    .innerJoin(applications, eq(interviews.applicationId, applications.id))
    .where(
      and(
        eq(interviews.organizationId, organizationId),
        eq(interviews.status, "completed"),
        sql`${applications.stage} IN ('offer', 'hired')`
      )
    );
  const advancedCount = advancedResult[0]?.count ?? 0;
  const advanceRate = totalCompleted > 0 ? Math.round((advancedCount / totalCompleted) * 1000) / 10 : 0;

  // Panel agreement rate: for interviews with 2+ scorecards, how often do verdicts agree?
  const multiPanelInterviews = await db
    .select({
      interviewId: scorecards.interviewId,
      verdict: scorecards.verdict,
    })
    .from(scorecards)
    .where(eq(scorecards.organizationId, organizationId))
    .orderBy(scorecards.interviewId);

  // Group scorecards by interview
  const byInterview = new Map<string, string[]>();
  for (const sc of multiPanelInterviews) {
    if (!sc.verdict) continue;
    const existing = byInterview.get(sc.interviewId) ?? [];
    existing.push(sc.verdict);
    byInterview.set(sc.interviewId, existing);
  }

  let agreedCount = 0;
  let multiPanelCount = 0;
  for (const [, verdicts] of byInterview) {
    if (verdicts.length < 2) continue;
    multiPanelCount++;
    if (verdicts.every((v) => v === verdicts[0])) agreedCount++;
  }
  const panelAgreementRate = multiPanelCount > 0
    ? Math.round((agreedCount / multiPanelCount) * 1000) / 10
    : 0;

  // Average scores by role
  const scoresByRole = await db
    .select({
      roleId: interviews.roleId,
      roleTitle: roles.title,
      avgScore: sql<number>`round(avg(${scorecards.overallRating}), 1)`,
      count: sql<number>`count(*)::int`,
    })
    .from(scorecards)
    .innerJoin(interviews, eq(scorecards.interviewId, interviews.id))
    .innerJoin(roles, eq(interviews.roleId, roles.id))
    .where(
      and(
        eq(scorecards.organizationId, organizationId),
        sql`${scorecards.overallRating} IS NOT NULL`
      )
    )
    .groupBy(interviews.roleId, roles.title);

  return {
    totalCompleted,
    advanceRate,
    panelAgreementRate,
    multiPanelCount,
    scoresByRole: scoresByRole.map((r) => ({
      roleId: r.roleId,
      role: r.roleTitle,
      avgScore: Number(r.avgScore),
      scorecardCount: r.count,
    })),
  };
}

/**
 * Get personal recruiter activity for today (for the Today page).
 * Counts actions performed by a specific user today.
 */
export async function getMyActivityToday(organizationId: string, userId: string) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Interviews scheduled today by this user
  const [interviewsScheduled] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(interviews)
    .where(
      and(
        eq(interviews.organizationId, organizationId),
        eq(interviews.createdById, userId),
        gte(interviews.createdAt, todayStart)
      )
    );

  // Offers created/sent today by this user
  const [offersMade] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(offers)
    .where(
      and(
        eq(offers.organizationId, organizationId),
        eq(offers.createdById, userId),
        gte(offers.createdAt, todayStart)
      )
    );

  // Applications advanced today (stage != sourced, updated by this user today)
  const [applicationsAdvanced] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(applications)
    .where(
      and(
        eq(applications.organizationId, organizationId),
        eq(applications.updatedById, userId),
        gte(applications.updatedAt, todayStart),
        sql`${applications.stage} != 'sourced'`
      )
    );

  // Candidates screened (applications created today by this user)
  const [candidatesScreened] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(applications)
    .where(
      and(
        eq(applications.organizationId, organizationId),
        eq(applications.createdById, userId),
        gte(applications.createdAt, todayStart)
      )
    );

  return {
    candidatesScreened: candidatesScreened?.count ?? 0,
    interviewsScheduled: interviewsScheduled?.count ?? 0,
    applicationsAdvanced: applicationsAdvanced?.count ?? 0,
    offersMade: offersMade?.count ?? 0,
  };
}

/**
 * Get team recruiter activity for the Insights page.
 * Shows activity distribution across team members.
 */
export async function getTeamActivity(organizationId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Activity by user across all entity types (last 30 days)
  const interviewActivity = await db
    .select({
      userId: interviews.createdById,
      userName: interviews.createdByName,
      count: sql<number>`count(*)::int`,
    })
    .from(interviews)
    .where(
      and(
        eq(interviews.organizationId, organizationId),
        gte(interviews.createdAt, thirtyDaysAgo),
        sql`${interviews.createdById} IS NOT NULL`
      )
    )
    .groupBy(interviews.createdById, interviews.createdByName);

  const offerActivity = await db
    .select({
      userId: offers.createdById,
      userName: offers.createdByName,
      count: sql<number>`count(*)::int`,
    })
    .from(offers)
    .where(
      and(
        eq(offers.organizationId, organizationId),
        gte(offers.createdAt, thirtyDaysAgo),
        sql`${offers.createdById} IS NOT NULL`
      )
    )
    .groupBy(offers.createdById, offers.createdByName);

  const applicationActivity = await db
    .select({
      userId: applications.createdById,
      userName: applications.createdByName,
      count: sql<number>`count(*)::int`,
    })
    .from(applications)
    .where(
      and(
        eq(applications.organizationId, organizationId),
        gte(applications.createdAt, thirtyDaysAgo),
        sql`${applications.createdById} IS NOT NULL`
      )
    )
    .groupBy(applications.createdById, applications.createdByName);

  // Merge into per-user totals
  const userMap = new Map<string, { name: string; interviews: number; offers: number; applications: number }>();

  for (const row of interviewActivity) {
    if (!row.userId) continue;
    const existing = userMap.get(row.userId) ?? { name: row.userName ?? "Unknown", interviews: 0, offers: 0, applications: 0 };
    existing.interviews = row.count;
    userMap.set(row.userId, existing);
  }
  for (const row of offerActivity) {
    if (!row.userId) continue;
    const existing = userMap.get(row.userId) ?? { name: row.userName ?? "Unknown", interviews: 0, offers: 0, applications: 0 };
    existing.offers = row.count;
    userMap.set(row.userId, existing);
  }
  for (const row of applicationActivity) {
    if (!row.userId) continue;
    const existing = userMap.get(row.userId) ?? { name: row.userName ?? "Unknown", interviews: 0, offers: 0, applications: 0 };
    existing.applications = row.count;
    userMap.set(row.userId, existing);
  }

  return Array.from(userMap.entries())
    .map(([userId, data]) => ({
      userId,
      name: data.name,
      interviews: data.interviews,
      offers: data.offers,
      applications: data.applications,
      total: data.interviews + data.offers + data.applications,
    }))
    .sort((a, b) => b.total - a.total);
}
