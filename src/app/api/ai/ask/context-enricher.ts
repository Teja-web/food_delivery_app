/**
 * Context enricher for Ask AI
 *
 * Provides two layers of context:
 * 1. Recruiting snapshot — lightweight stats so the AI understands current state
 * 2. Entity context — pre-fetched entity data when viewing a specific record
 */

import { db } from "@/db/client";
import {
  candidates,
  orgCandidates,
  roles,
  applications,
  interviews,
  offers,
  assessments,
  pools,
  matches,
} from "@/db/schema";
import { eq, count, avg, and, sql, exists } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Entity fetchers
// ---------------------------------------------------------------------------

type EntityFetcher = (id: string, organizationId: string) => Promise<string | null>;

async function fetchCandidate(id: string, organizationId: string): Promise<string | null> {
  const [row] = await db
    .select({
      id: candidates.id,
      name: candidates.name,
      email: candidates.email,
      phone: candidates.phone,
      status: candidates.status,
      source: candidates.source,
      location: candidates.location,
      talentScore: candidates.talentScore,
      experience: candidates.experience,
      createdAt: candidates.createdAt,
    })
    .from(candidates)
    .where(and(
      eq(candidates.id, id),
      // Visibility via org_candidates membership (Phase 1).
      exists(
        db.select({ one: sql`1` }).from(orgCandidates).where(and(
          eq(orgCandidates.candidateId, candidates.id),
          eq(orgCandidates.organizationId, organizationId),
        )),
      ),
    ));

  if (!row) return null;

  // Get active applications for this candidate
  const apps = await db
    .select({
      id: applications.id,
      stage: applications.stage,
      roleId: applications.roleId,
    })
    .from(applications)
    .where(and(eq(applications.candidateId, id), eq(applications.organizationId, organizationId)))
    .limit(5);

  return JSON.stringify({ ...row, activeApplications: apps });
}

async function fetchRole(id: string, organizationId: string): Promise<string | null> {
  const [row] = await db
    .select({
      id: roles.id,
      title: roles.title,
      team: roles.team,
      department: roles.department,
      location: roles.location,
      status: roles.status,
      health: roles.health,
      headcount: roles.headcount,
      targetHireDate: roles.targetHireDate,
      createdAt: roles.createdAt,
    })
    .from(roles)
    .where(and(eq(roles.id, id), eq(roles.organizationId, organizationId)));

  if (!row) return null;

  // Get pipeline stats
  const pipeline = await db
    .select({
      stage: applications.stage,
      count: count(),
    })
    .from(applications)
    .where(and(eq(applications.roleId, id), eq(applications.organizationId, organizationId)))
    .groupBy(applications.stage);

  // Get top matches
  const topMatches = await db
    .select({
      candidateId: matches.candidateId,
      fitScore: matches.fitScore,
      recommendation: matches.recommendation,
      signal: matches.signal,
    })
    .from(matches)
    .where(and(eq(matches.roleId, id), eq(matches.organizationId, organizationId)))
    .orderBy(sql`${matches.fitScore} DESC NULLS LAST`)
    .limit(5);

  return JSON.stringify({ ...row, pipeline, topMatches });
}

async function fetchApplication(id: string, organizationId: string): Promise<string | null> {
  const [row] = await db
    .select({
      id: applications.id,
      stage: applications.stage,
      source: applications.source,
      candidateId: applications.candidateId,
      roleId: applications.roleId,
      matchId: applications.matchId,
      daysInStage: applications.daysInStage,
      createdAt: applications.createdAt,
    })
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.organizationId, organizationId)));

  if (!row) return null;

  // Get related match if exists
  const [match] = await db
    .select({
      fitScore: matches.fitScore,
      recommendation: matches.recommendation,
      signal: matches.signal,
      summary: matches.summary,
      gaps: matches.gaps,
    })
    .from(matches)
    .where(
      and(
        eq(matches.candidateId, row.candidateId),
        eq(matches.roleId, row.roleId),
        eq(matches.organizationId, organizationId)
      )
    )
    .limit(1);

  return JSON.stringify({ ...row, match: match ?? null });
}

async function fetchInterview(id: string, organizationId: string): Promise<string | null> {
  const [row] = await db
    .select({
      id: interviews.id,
      status: interviews.status,
      interviewType: interviews.interviewType,
      scheduledAt: interviews.scheduledAt,
      durationMins: interviews.durationMins,
      location: interviews.location,
      applicationId: interviews.applicationId,
      createdAt: interviews.createdAt,
    })
    .from(interviews)
    .where(and(eq(interviews.id, id), eq(interviews.organizationId, organizationId)));

  return row ? JSON.stringify(row) : null;
}

async function fetchOffer(id: string, organizationId: string): Promise<string | null> {
  const [row] = await db
    .select({
      id: offers.id,
      status: offers.status,
      startDate: offers.startDate,
      validUntil: offers.validUntil,
      applicationId: offers.applicationId,
      compensation: offers.compensation,
      recommendation: offers.recommendation,
      createdAt: offers.createdAt,
    })
    .from(offers)
    .where(and(eq(offers.id, id), eq(offers.organizationId, organizationId)));

  return row ? JSON.stringify(row) : null;
}

async function fetchAssessment(id: string, organizationId: string): Promise<string | null> {
  const [row] = await db
    .select({
      id: assessments.id,
      title: assessments.title,
      description: assessments.description,
      type: assessments.type,
      status: assessments.status,
      visibility: assessments.visibility,
      createdAt: assessments.createdAt,
    })
    .from(assessments)
    .where(and(eq(assessments.id, id), eq(assessments.organizationId, organizationId)));

  return row ? JSON.stringify(row) : null;
}

async function fetchPool(id: string, organizationId: string): Promise<string | null> {
  const [row] = await db
    .select({
      id: pools.id,
      name: pools.name,
      description: pools.description,
      health: pools.health,
      createdAt: pools.createdAt,
    })
    .from(pools)
    .where(and(eq(pools.id, id), eq(pools.organizationId, organizationId)));

  return row ? JSON.stringify(row) : null;
}

const fetchers: Record<string, EntityFetcher> = {
  candidate: fetchCandidate,
  role: fetchRole,
  application: fetchApplication,
  interview: fetchInterview,
  offer: fetchOffer,
  assessment: fetchAssessment,
  pool: fetchPool,
};

const ENTITY_LABELS: Record<string, string> = {
  candidate: "candidate",
  role: "role",
  application: "application",
  interview: "interview",
  offer: "offer",
  assessment: "assessment",
  pool: "talent pool",
  insights: "insights",
};

// ---------------------------------------------------------------------------
// Recruiting snapshot — lightweight stats for grounding
// ---------------------------------------------------------------------------

async function getRecruitingSnapshot(organizationId: string): Promise<string> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Parallel fetch all stats (org-scoped)
  const [
    roleStats,
    candidateStats,
    applicationStats,
    interviewStats,
    offerStats,
  ] = await Promise.all([
    // Role stats
    db
      .select({
        total: count(),
        open: count(sql`CASE WHEN ${roles.status} = 'open' THEN 1 END`),
        draft: count(sql`CASE WHEN ${roles.status} = 'draft' THEN 1 END`),
      })
      .from(roles)
      .where(eq(roles.organizationId, organizationId))
      .then((r) => r[0]),

    // Candidate stats
    db
      .select({
        total: count(),
        newThisMonth: count(
          sql`CASE WHEN ${candidates.createdAt} >= ${thirtyDaysAgo} THEN 1 END`
        ),
        avgScore: avg(candidates.talentScore),
      })
      .from(candidates)
      .where(exists(
        db.select({ one: sql`1` }).from(orgCandidates).where(and(
          eq(orgCandidates.candidateId, candidates.id),
          eq(orgCandidates.organizationId, organizationId),
        )),
      ))
      .then((r) => r[0]),

    // Application stats by stage
    db
      .select({
        stage: applications.stage,
        count: count(),
      })
      .from(applications)
      .where(eq(applications.organizationId, organizationId))
      .groupBy(applications.stage),

    // Interview stats
    db
      .select({
        total: count(),
        upcoming: count(
          sql`CASE WHEN ${interviews.scheduledAt} >= ${now} THEN 1 END`
        ),
        completed: count(
          sql`CASE WHEN ${interviews.status} = 'completed' THEN 1 END`
        ),
      })
      .from(interviews)
      .where(eq(interviews.organizationId, organizationId))
      .then((r) => r[0]),

    // Offer stats
    db
      .select({
        total: count(),
        pending: count(
          sql`CASE WHEN ${offers.status} = 'pending' THEN 1 END`
        ),
        accepted: count(
          sql`CASE WHEN ${offers.status} = 'accepted' THEN 1 END`
        ),
        declined: count(
          sql`CASE WHEN ${offers.status} = 'declined' THEN 1 END`
        ),
      })
      .from(offers)
      .where(eq(offers.organizationId, organizationId))
      .then((r) => r[0]),
  ]);

  const totalApplications = (applicationStats ?? []).reduce(
    (sum, s) => sum + Number(s.count),
    0
  );

  const stageBreakdown = (applicationStats ?? [])
    .map((s) => `${s.count} ${s.stage}`)
    .join(", ");

  const lines = [
    "## Recruiting Snapshot — Current State",
    "",
    `**Open Roles**: ${roleStats?.open ?? 0} actively hiring, ${roleStats?.draft ?? 0} in draft`,
    "",
    `**Talent Pool**: ${candidateStats?.total ?? 0} candidates total, ${candidateStats?.newThisMonth ?? 0} added this month${candidateStats?.avgScore ? ` (avg talent score: ${Math.round(Number(candidateStats.avgScore))}/100)` : ""}`,
    "",
    `**Pipeline**: ${totalApplications} applications${stageBreakdown ? ` — ${stageBreakdown}` : ""}`,
    "",
    `**Interviews**: ${interviewStats?.upcoming ?? 0} upcoming, ${interviewStats?.completed ?? 0} completed`,
    "",
    `**Offers**: ${offerStats?.pending ?? 0} pending response, ${offerStats?.accepted ?? 0} accepted, ${offerStats?.declined ?? 0} declined`,
    "",
    "Use this snapshot to ground your answers. Reference these numbers when discussing hiring progress.",
  ];

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Briefing goals by entity type
// ---------------------------------------------------------------------------

const BRIEFING_GOALS: Record<string, string> = {
  candidate:
    "Lead with talent score, current status, and active applications. Highlight strengths and any gaps. Recommend the logical next step.",
  role: "Lead with pipeline coverage, days open, and candidate quality. If the pipeline is thin, say so. Recommend what to do next to move toward a hire.",
  application:
    "Lead with current stage, fit score, and what should happen next. If there's match intelligence, summarize the verdict. Recommend whether to advance or pass.",
  interview:
    "Lead with interview status, scheduled time, and preparation needs. If feedback exists, summarize it. Recommend the next step.",
  offer:
    "Lead with offer status, timeline (days until expiration), and likelihood of acceptance. Recommend whether to follow up or adjust terms.",
  assessment:
    "Lead with completion rate, average scores, and any pending evaluations. Highlight top performers. Recommend next steps.",
  pool: "Lead with pool health, member count, and recent activity. Identify top candidates. Suggest engagement strategies.",
  insights:
    "Provide a high-level summary of hiring health. Highlight what needs attention, which roles are at risk, and where the pipeline is strong.",
};

// ---------------------------------------------------------------------------
// Main enricher
// ---------------------------------------------------------------------------

export async function enrichEntityContext(
  context: Record<string, unknown>,
  organizationId?: string
): Promise<string> {
  const entity = context.entity as string | undefined;
  const id = context.id as string | undefined;
  const view = context.view as string | undefined;

  // If no organizationId provided, return minimal context to prevent cross-org data leaks
  if (!organizationId) {
    return "No organization context available. Use tools to query data with proper org scoping.";
  }

  // Always include the recruiting snapshot (org-scoped)
  const snapshot = await getRecruitingSnapshot(organizationId);

  // No entity context — return just the snapshot
  if (!entity) {
    return snapshot;
  }

  const label = ENTITY_LABELS[entity] ?? entity;

  // Insights is a special case (no id)
  if (entity === "insights") {
    return `${snapshot}\n\n---\nThe user is viewing the Insights dashboard. Help them understand hiring health, bottlenecks, and what needs attention.`;
  }

  // List view — snapshot + navigation hint
  if (view === "list" || !id) {
    return `${snapshot}\n\n---\nThe user is browsing the ${label} list. They may ask questions about ${label}s in general, want to search, or need recommendations.`;
  }

  // Detail view — use client-provided data if available, otherwise fetch
  const clientData = context.data as Record<string, unknown> | undefined;
  let data: string | null;

  if (clientData && Object.keys(clientData).length > 0) {
    data = JSON.stringify(clientData);
  } else {
    const fetcher = fetchers[entity];
    if (!fetcher) {
      return `${snapshot}\n\n---\nThe user is viewing a ${label} (ID: ${id}).`;
    }
    data = await fetcher(id, organizationId);
  }

  if (!data) {
    return `${snapshot}\n\n---\nThe user is viewing a ${label} (ID: ${id}), but it could not be found.`;
  }

  const briefingGoal =
    BRIEFING_GOALS[entity] ?? `Brief the user on this ${label}'s current status.`;

  // For detail views, skip global snapshot — focus only on the entity
  return [
    `## Current ${label.charAt(0).toUpperCase() + label.slice(1)}\n${data}\n`,
    `\n## BRIEFING INSTRUCTION\n${briefingGoal}\n`,
    "Be concise and specific. Reference actual data from the context above. Focus only on this specific entity, not organization-wide stats. If you recommend an action, offer to help execute it.",
  ].join("");
}
