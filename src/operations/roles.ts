import { createEntityCrud } from "@/lib/crud";
import { db } from "@/db/client";
import { eq, and, notInArray, sql, inArray, gte, asc, desc, or, ilike, type SQL } from "drizzle-orm";
import { roles, interviewStages, interviews, applications, matches, candidates, orgCandidates } from "@/db/schema";
import { STALE_THRESHOLD_DAYS } from "@/lib/pipeline-stage";
import { roleSchema } from "./schemas";
import { getEntityActivity } from "./entity-activity";
import { getOrgIdentityContext } from "@/lib/org-context";
import { getActionContext } from "@/lib/auth/context";
import type { RoleCriteriaConfig } from "@/db/schema/roles";
import { PUBLIC_VISIBILITY, type PublicVisibility } from "@/db/schema/roles";
import { rolePublicSlug } from "@/lib/anonymize/slug";
import { bucketSize } from "@/lib/anonymize/k-anonymity";
import { getOrgPublicProfile } from "@/operations/organization";
import { safeRevalidate } from "@/lib/safe-revalidate";

/**
 * Typed error for visibility transitions that fail the k-anonymity gate.
 * Action layer catches and translates to `{ ok: false, reason }`.
 */
export class VisibilityError extends Error {
  reason: "no_public_profile" | "k_anonymity_blocked";
  constructor(reason: "no_public_profile" | "k_anonymity_blocked") {
    super(reason);
    this.name = "VisibilityError";
    this.reason = reason;
  }
}

export interface InterviewStageInput {
  name: string;
  type?: string;
  durationMins: number;
  competencies: string[];
}

/* -- Role context builder ------------------------------------------- */

async function buildRoleContext(r: any): Promise<string> {
  const sections: string[] = [];

  // Header
  const header = [`## Role: ${r.title}`];
  const meta = [r.team && `Team: ${r.team}`, r.department && `Department: ${r.department}`, r.location && `Location: ${r.location}`].filter(Boolean);
  if (meta.length) header.push(meta.join(" | "));
  if (r.status) header.push(`Status: ${r.status}`);
  sections.push(header.join("\n"));

  // Description
  if (r.description) sections.push(r.description);

  // Business case
  if (r.businessCase) sections.push(`### Business Case\n${r.businessCase}`);

  // Criteria
  const config = r.criteriaConfig as RoleCriteriaConfig | null;
  if (config?.criteria?.length) {
    const lines = config.criteria.map((c) =>
      `[${c.weight}] ${c.category}: ${c.name} — ${c.description}`,
    );
    sections.push(`### Criteria\n${lines.join("\n")}`);
  }

  // Interview stages
  const stages = r.interviewStages as any[] | null;
  if (stages?.length) {
    const sorted = [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const lines = sorted.map((s, i) => {
      const competencies = s.competencies?.length ? `: ${s.competencies.join(", ")}` : "";
      return `${i + 1}. ${s.name} (${s.durationMins ?? "?"}min)${competencies}`;
    });
    sections.push(`### Interview Stages\n${lines.join("\n")}`);
  }

  // Org identity (fetched separately — not a Drizzle relation on roles)
  if (r.organizationId) {
    const orgContext = await getOrgIdentityContext(r.organizationId);
    if (orgContext) sections.push(orgContext);
  }

  return sections.join("\n\n");
}

/* -- CRUD instance -------------------------------------------------- */

const roleCrud = createEntityCrud({
  db,
  table: roles,
  queryKey: "roles",
  idField: "id",
  schema: roleSchema,
  onMutate: () => safeRevalidate("/roles"),
  getWith: {
    hiringManager: true,
    recruiter: true,
    applications: { with: { candidate: true, match: true } },
  },
  searchFields: ["title", "team", "department", "location", "description", "businessCase"],
  searchConfig: { tableName: "roles" },
  contextWith: {
    interviewStages: true,
  },
  buildContext: buildRoleContext,
  // Vendor users see roles by visibility, not by ownership.
  // (vendor-and-attribution-plan.md Phase 3.)
  scopeOverride: (ctx, t) => {
    if (ctx.orgType !== "vendor") return eq(t.organizationId, ctx.organizationId);
    if (ctx.partneredHiringOrgIds.length === 0) {
      return eq(t.organizationId, "__no_partnerships__");
    }
    return and(
      inArray(t.organizationId, ctx.partneredHiringOrgIds),
      sql`(${t.vendorVisibility} = 'all' OR (${t.vendorVisibility} = 'exclusive' AND ${t.exclusiveVendorOrgId} = ${ctx.organizationId}))`,
    );
  },
});

/**
 * Fetch a role with full pipeline + match intelligence for the detail page.
 * Uses drizzle relational queries — no raw SQL in page components.
 */
export async function getRoleDetail(id: string) {
  return roleCrud.get(id, {
    with: {
      hiringManager: true,
      recruiter: true,
      applications: {
        with: {
          candidate: true,
          match: true,
          interviews: {
            with: { scorecards: true, panelists: { with: { user: true } } },
          },
        },
      },
      matches: {
        with: {
          candidate: true,
        },
      },
      interviewStages: true,
    },
  });
}

export const getRoles = roleCrud.list;
export const searchRoles = roleCrud.search;
const searchRolesSemantic = roleCrud.searchSemantic;
export const getRole = roleCrud.get;
export const getRoleContext = roleCrud.getEntityContext;
export const createRole = roleCrud.create;
export const updateRole = roleCrud.update;
export const deleteRole = roleCrud.delete;

/**
 * List roles with full pipeline data for performance reports.
 * Filters by recruiter, hiring manager, or department.
 */
export async function listRolesForPerformanceReport(
  filter: { recruiterId: string } | { hiringManagerId: string } | { department: string },
) {
  const ctx = await getActionContext();
  const where = "recruiterId" in filter
    ? and(eq(roles.organizationId, ctx.organizationId), eq(roles.recruiterId, filter.recruiterId))
    : "hiringManagerId" in filter
    ? and(eq(roles.organizationId, ctx.organizationId), eq(roles.hiringManagerId, filter.hiringManagerId))
    : and(eq(roles.organizationId, ctx.organizationId), eq(roles.department, filter.department));

  return db.query.roles.findMany({
    where,
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    with: {
      applications: {
        with: {
          candidate: true,
          match: true,
          interviews: {
            with: { scorecards: true, panelists: { with: { user: true } } },
          },
        },
      },
    },
  });
}

/* -- Paginated sub-lists for role detail -------------------------------- */

const PAGE_SIZE = 25;

const SELECT_ALL_MATCHING_CAP = 500;

/**
 * Return all application IDs matching a Pipeline filter, up to a hard cap.
 * Used by the "Select all matching" affordance to expand UI selection
 * beyond the loaded page without paying a server-resolved batch action.
 *
 * Cap: 500 rows. If the filter matches more, returns { ids, exceeded: true }
 * and the UI must require the user to refine.
 */
export async function fetchAllMatchingApplicationIds(
  roleId: string,
  opts?: {
    stage?: string | string[];
    q?: string;
    stale?: boolean;
    decisionReady?: boolean;
  },
): Promise<{ ids: string[]; exceeded: boolean }> {
  const conditions: (SQL<unknown> | undefined)[] = [eq(applications.roleId, roleId)];
  if (opts?.stage !== undefined) {
    conditions.push(Array.isArray(opts.stage) ? inArray(applications.stage, opts.stage) : eq(applications.stage, opts.stage));
  }
  if (opts?.stale) conditions.push(gte(applications.daysInStage, STALE_THRESHOLD_DAYS));
  if (opts?.decisionReady) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM dilliznt.application_intelligence ai
      WHERE ai.application_id = ${applications.id}
        AND ai.decision_readiness->>'isReady' = 'true'
    )`);
  }
  if (opts?.q && opts.q.trim().length > 0) {
    const pattern = `%${opts.q.trim()}%`;
    conditions.push(sql`EXISTS (
      SELECT 1 FROM dilliznt.candidates c
      WHERE c.id = ${applications.candidateId}
        AND (c.name ILIKE ${pattern} OR c.email ILIKE ${pattern} OR c.title ILIKE ${pattern} OR c.company ILIKE ${pattern})
    )`);
  }
  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

  // Fetch up to cap+1 to detect overflow.
  const rows = await db
    .select({ id: applications.id })
    .from(applications)
    .where(whereClause)
    .limit(SELECT_ALL_MATCHING_CAP + 1);

  return {
    ids: rows.slice(0, SELECT_ALL_MATCHING_CAP).map((r) => r.id),
    exceeded: rows.length > SELECT_ALL_MATCHING_CAP,
  };
}

/**
 * Smart-filter counts for the Pipeline tab — used by the chips row.
 * Single round-trip with FILTER aggregations.
 */
export async function getRolePipelineSmartCounts(roleId: string): Promise<{
  stale: number;
  decisionReady: number;
}> {
  const [row] = await db.execute<{ stale: number; decision_ready: number }>(sql`
    SELECT
      COUNT(*) FILTER (
        WHERE a.days_in_stage >= ${STALE_THRESHOLD_DAYS}
          AND a.stage NOT IN ('rejected', 'withdrawn', 'hired')
      )::int AS stale,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM dilliznt.application_intelligence ai
          WHERE ai.application_id = a.id
            AND ai.decision_readiness->>'isReady' = 'true'
        )
      )::int AS decision_ready
    FROM dilliznt.applications a
    WHERE a.role_id = ${roleId}
  `).then((r) => r.rows);
  return {
    stale: Number(row?.stale ?? 0),
    decisionReady: Number(row?.decision_ready ?? 0),
  };
}

/**
 * Smart-filter counts for the Recommended tab — used by the chips row.
 * Currently surfaces just "newThisWeek" (matches with lastEvaluatedAt within
 * the last 7 days). Excludes recommendations that are already in pipeline.
 */
export async function getRoleRecommendedSmartCounts(roleId: string): Promise<{
  newThisWeek: number;
}> {
  const ctx = await getActionContext();
  const [row] = await db.execute<{ new_this_week: number }>(sql`
    SELECT COUNT(*)::int AS new_this_week
    FROM dilliznt.matches m
    WHERE m.role_id = ${roleId}
      AND m.organization_id = ${ctx.organizationId}
      AND m.status = 'active'
      AND m.fit_score >= 10
      AND m.last_evaluated_at >= NOW() - interval '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM dilliznt.applications a
        WHERE a.role_id = m.role_id AND a.candidate_id = m.candidate_id
      )
      AND EXISTS (
        SELECT 1 FROM dilliznt.org_candidates oc
        WHERE oc.candidate_id = m.candidate_id AND oc.organization_id = ${ctx.organizationId}
      )
  `).then((r) => r.rows);
  return {
    newThisWeek: Number(row?.new_this_week ?? 0),
  };
}

/**
 * Paginated applications for a role, with candidate + match + interview relations.
 * Returns { items, total } like the CRUD factory's list().
 *
 * Optional filters/sorts:
 *   - stage:    filter to one or many stages (e.g. "sourced" or ["sourced", "interview"])
 *   - q:              search candidate name/email/title/company (case-insensitive, ilike)
 *   - sortBy:         "createdAt" (default) | "updatedAt" | "daysInStage"
 *   - stale:          only applications where daysInStage >= STALE_THRESHOLD_DAYS
 *   - decisionReady:  applications where applicationIntelligence.decisionReadiness.isReady
 *                     (JSONB EXISTS subquery; matches the rule task's contract)
 *
 * NOT YET implemented (Phase 1+ deferrals):
 *   - sortBy: "fitScore" — needs leftJoin(matches) with NULLS LAST; deferred to Phase 1
 *                          when the UI sort dropdown actually wires it.
 */
export async function listApplicationsForRole(
  roleId: string,
  opts?: {
    offset?: number;
    limit?: number;
    stage?: string | string[];
    q?: string;
    sortBy?: "createdAt" | "updatedAt" | "daysInStage";
    sortOrder?: "asc" | "desc";
    stale?: boolean;
    decisionReady?: boolean;
  },
) {
  const {
    offset = 0,
    limit = PAGE_SIZE,
    stage,
    q,
    sortBy = "createdAt",
    sortOrder = "desc",
    stale = false,
    decisionReady = false,
  } = opts ?? {};

  // Build WHERE clause from filters.
  const conditions: (SQL<unknown> | undefined)[] = [eq(applications.roleId, roleId)];

  if (stage !== undefined) {
    conditions.push(Array.isArray(stage) ? inArray(applications.stage, stage) : eq(applications.stage, stage));
  }
  if (stale) {
    conditions.push(gte(applications.daysInStage, STALE_THRESHOLD_DAYS));
  }
  if (decisionReady) {
    // applicationIntelligence.decisionReadiness is JSONB { isReady: boolean, ... }.
    // Match the application via EXISTS so we keep the relational findMany shape.
    conditions.push(sql`EXISTS (
      SELECT 1 FROM dilliznt.application_intelligence ai
      WHERE ai.application_id = ${applications.id}
        AND ai.decision_readiness->>'isReady' = 'true'
    )`);
  }

  // Candidate-name search requires an EXISTS subquery so we don't disturb the
  // relational findMany shape below.
  if (q && q.trim().length > 0) {
    const pattern = `%${q.trim()}%`;
    conditions.push(sql`EXISTS (
      SELECT 1 FROM dilliznt.candidates c
      WHERE c.id = ${applications.candidateId}
        AND (
          c.name ILIKE ${pattern}
          OR c.email ILIKE ${pattern}
          OR c.title ILIKE ${pattern}
          OR c.company ILIKE ${pattern}
        )
    )`);
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(applications)
    .where(whereClause);
  const total = Number(countResult?.count ?? 0);

  const items = await db.query.applications.findMany({
    where: whereClause,
    orderBy: (t) => {
      const dir = sortOrder === "asc" ? asc : desc;
      switch (sortBy) {
        case "updatedAt":
          return [dir(t.updatedAt)];
        case "daysInStage":
          // NULLS LAST so apps without a daysInStage value drop to bottom on desc, top on asc.
          return [sql`${t.daysInStage} ${sortOrder === "asc" ? sql`ASC NULLS FIRST` : sql`DESC NULLS LAST`}`];
        case "createdAt":
        default:
          return [dir(t.createdAt)];
      }
    },
    limit,
    offset,
    with: {
      candidate: true,
      match: true,
      interviews: {
        with: { scorecards: true, panelists: { with: { user: true } } },
      },
      offers: { columns: { id: true } },
    },
  });

  return { items, total };
}

/**
 * Paginated recommended matches for a role (active, not yet in pipeline, fitScore >= 10).
 * Returns { items, total }.
 *
 * Optional filters/sorts:
 *   - recommendation: filter to one or many recommendation levels
 *                     (e.g. "strong_yes" or ["strong_yes", "yes"])
 *   - q:              search candidate name/email/title/company (case-insensitive)
 *   - sortBy:         "fitScore" (default) | "matchedAt" | "updatedAt"
 */
export async function listRecommendationsForRole(
  roleId: string,
  opts?: {
    offset?: number;
    limit?: number;
    recommendation?: string | string[];
    q?: string;
    sortBy?: "fitScore" | "matchedAt" | "updatedAt";
    sortOrder?: "asc" | "desc";
    /** Only include matches with lastEvaluatedAt within the last N days. */
    recencyDays?: number;
  },
) {
  const {
    offset = 0,
    limit = PAGE_SIZE,
    recommendation,
    q,
    sortBy = "fitScore",
    sortOrder = "desc",
    recencyDays,
  } = opts ?? {};
  const ctx = await getActionContext();

  // Get candidateIds already in pipeline for this role
  const pipelineRows = await db
    .select({ candidateId: applications.candidateId })
    .from(applications)
    .where(eq(applications.roleId, roleId));
  const pipelineCandidateIds = pipelineRows.map((r) => r.candidateId);

  // Pre-compute the candidate-ID allow list. Drizzle's relational query API
  // aliases `dilliznt.matches` → `matches`, which makes correlated subqueries
  // referencing `matches.candidate_id` render as the now-out-of-scope
  // `dilliznt.matches.candidate_id`. Doing the join in app code sidesteps that.
  const visibleRows = await db
    .select({ id: orgCandidates.candidateId })
    .from(orgCandidates)
    .where(eq(orgCandidates.organizationId, ctx.organizationId));
  let allowedCandidateIds = visibleRows.map((r) => r.id);

  if (q && q.trim().length > 0 && allowedCandidateIds.length > 0) {
    const pattern = `%${q.trim()}%`;
    const matched = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(and(
        inArray(candidates.id, allowedCandidateIds),
        or(
          ilike(candidates.name, pattern),
          ilike(candidates.email, pattern),
          ilike(candidates.title, pattern),
          ilike(candidates.company, pattern),
        ),
      ));
    allowedCandidateIds = matched.map((r) => r.id);
  }

  if (allowedCandidateIds.length === 0) {
    return { items: [], total: 0 };
  }

  const filterConditions: (SQL<unknown> | undefined)[] = [
    eq(matches.roleId, roleId),
    eq(matches.organizationId, ctx.organizationId),
    eq(matches.status, "active"),
    gte(matches.fitScore, 10),
    inArray(matches.candidateId, allowedCandidateIds),
  ];

  if (pipelineCandidateIds.length > 0) {
    filterConditions.push(notInArray(matches.candidateId, pipelineCandidateIds));
  }

  if (recommendation !== undefined) {
    filterConditions.push(
      Array.isArray(recommendation)
        ? inArray(matches.recommendation, recommendation)
        : eq(matches.recommendation, recommendation),
    );
  }

  if (recencyDays !== undefined && recencyDays > 0) {
    filterConditions.push(gte(matches.lastEvaluatedAt, sql`NOW() - (${recencyDays} || ' days')::interval`));
  }

  const baseWhere = and(...filterConditions);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(matches)
    .where(baseWhere);
  const total = Number(countResult?.count ?? 0);

  const items = await db.query.matches.findMany({
    where: baseWhere,
    orderBy: (t) => {
      const dir = sortOrder === "asc" ? asc : desc;
      switch (sortBy) {
        case "matchedAt":
          return [dir(t.createdAt)];
        case "updatedAt":
          return [dir(t.updatedAt)];
        case "fitScore":
        default:
          return [dir(t.fitScore)];
      }
    },
    limit,
    offset,
    with: {
      candidate: true,
    },
  });

  return { items, total };
}


/**
 * Replace all interview stages for a role.
 * Uses upsert to handle stages referenced by interviews (FK constraint).
 * - Updates existing stages by matching on name
 * - Inserts new stages
 * - Only deletes unreferenced stages
 */
export async function replaceInterviewStages(roleId: string, stages: InterviewStageInput[]) {
  // Get existing stages
  const existing = await db.query.interviewStages.findMany({
    where: eq(interviewStages.roleId, roleId),
  });

  const existingByName = new Map(existing.map((s) => [s.name, s]));
  const incomingNames = new Set(stages.map((s) => s.name));
  const updatedIds: string[] = [];

  // Update or insert each stage
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    const existingStage = existingByName.get(s.name);

    if (existingStage) {
      // Update existing stage
      await db.update(interviewStages).set({
        type: s.type ?? "interview",
        durationMins: s.durationMins,
        competencies: s.competencies,
        order: i,
        updatedAt: new Date(),
      }).where(eq(interviewStages.id, existingStage.id));
      updatedIds.push(existingStage.id);
    } else {
      // Insert new stage
      const [newStage] = await db.insert(interviewStages).values({
        roleId,
        name: s.name,
        type: s.type ?? "interview",
        durationMins: s.durationMins,
        competencies: s.competencies,
        order: i,
      }).returning();
      updatedIds.push(newStage.id);
    }
  }

  // Delete stages that are no longer in the list AND not referenced by interviews
  const stagesToRemove = existing.filter((s) => !incomingNames.has(s.name));
  for (const stage of stagesToRemove) {
    // Check if stage is referenced by any interview
    const referencingInterview = await db.query.interviews.findFirst({
      where: eq(interviews.stageId, stage.id),
      columns: { id: true },
    });

    if (!referencingInterview) {
      await db.delete(interviewStages).where(eq(interviewStages.id, stage.id));
    }
    // If referenced, leave the stage (it will be orphaned from the role's active stages but data is preserved)
  }
}

/**
 * Get recent activity log entries for a role and its related entities.
 * Pass related application/match IDs for a complete activity feed.
 */
export async function getRoleActivityLog(
  roleId: string,
  related?: { application?: string[]; match?: string[] },
  limit = 50,
) {
  return getEntityActivity("role", roleId, {
    related: {
      ...(related?.application?.length ? { application: related.application } : {}),
      ...(related?.match?.length ? { match: related.match } : {}),
    },
    limit,
  });
}

/* -- Public visibility ------------------------------------------------ */

/**
 * Read just the public visibility metadata for a role. Used by the per-role
 * admin card alongside the existing role detail data.
 */
export async function getRolePublicMeta(roleId: string): Promise<{
  publicVisibility: PublicVisibility;
  publicSlug: string | null;
} | null> {
  const ctx = await getActionContext();
  const [row] = await db
    .select({
      publicVisibility: roles.publicVisibility,
      publicSlug: roles.publicSlug,
    })
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.organizationId, ctx.organizationId)))
    .limit(1);
  if (!row) return null;
  return {
    publicVisibility: row.publicVisibility as PublicVisibility,
    publicSlug: row.publicSlug,
  };
}

/**
 * Update a role's public visibility. Generates the slug on first non-private
 * save (lazy; deterministic from role id, so re-runs are no-ops).
 *
 * Server-side k-anonymity gate: anonymized requires a populated public profile
 * AND a bucket count >= floor (`anonymize/k-anonymity.K_ANONYMITY_FLOOR`).
 * Public requires only the public profile (org consents to be named).
 *
 * Throws `VisibilityError` on gate failure. The UI shows a warning before
 * submit, but a direct action call must also be gated.
 */
export async function setRolePublicVisibility(
  roleId: string,
  visibility: PublicVisibility,
): Promise<{ publicVisibility: PublicVisibility; publicSlug: string | null }> {
  if (!PUBLIC_VISIBILITY.includes(visibility)) {
    throw new Error(`Invalid publicVisibility: ${visibility}`);
  }
  const ctx = await getActionContext();

  if (visibility !== "private") {
    const profile = await getOrgPublicProfile();
    if (!profile) throw new VisibilityError("no_public_profile");
    if (visibility === "anonymized") {
      const bucket = await bucketSize(profile);
      if (!bucket.ok) throw new VisibilityError("k_anonymity_blocked");
    }
  }

  const slug = visibility === "private" ? undefined : rolePublicSlug(roleId);

  const [updated] = await db
    .update(roles)
    .set({
      publicVisibility: visibility,
      ...(slug ? { publicSlug: slug } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(roles.id, roleId), eq(roles.organizationId, ctx.organizationId)))
    .returning({
      publicVisibility: roles.publicVisibility,
      publicSlug: roles.publicSlug,
    });

  if (!updated) throw new Error("Role not found");
  safeRevalidate(`/recruit/roles/${roleId}`);
  return {
    publicVisibility: updated.publicVisibility as PublicVisibility,
    publicSlug: updated.publicSlug,
  };
}

