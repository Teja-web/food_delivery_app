/**
 * Knowledge-search surface — coznt-native equivalent of gstack's gbrain.
 *
 * Each helper composes `searchHybrid()` (pgvector + BM25 fusion) with the
 * scoping rules of the underlying entity. The agent sees one search
 * surface per entity — `searchLearnings`, `searchPlans`, `searchOutcomes`,
 * `searchAudit` — instead of a single generic search that pushes routing
 * onto the AI's prompt.
 *
 * Mode passthrough: `hybrid` (default), `vector` (semantic only), or
 * `keyword` (BM25 only). `searchHybrid()`'s `weights` parameter is how
 * we express each mode at the SQL layer.
 */

import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { auditLogs, type AuditActorType } from "@/db/schema/audit/audit-log";
import { projectTasks as plans, type PlanKind, type PlanStatus } from "@/db/schema/plan/project-task";
import { projectLearnings } from "@/db/schema/plan/project-learning";
import { projects } from "@/db/schema/project";
import {
  skillOutcomes,
  type SkillOutcomeVerdict,
} from "@/db/schema/skill/skill-outcome";
import { skills } from "@/db/schema/skill/skill";
import { getActionContext } from "@/lib/auth/context";
import { searchHybrid } from "@/lib/search";

export type SearchMode = "hybrid" | "vector" | "keyword";

function weightsFor(mode: SearchMode): { vector: number; text: number } {
  if (mode === "vector") return { vector: 1, text: 0 };
  if (mode === "keyword") return { vector: 0, text: 1 };
  return { vector: 0.5, text: 0.5 };
}

// ─── Learnings ──────────────────────────────────────────────────────────

export interface LearningHit {
  id: string;
  body: string;
  pinned: boolean;
  projectId: string;
  createdAt: Date;
  score: number;
}

export async function searchLearnings(args: {
  query: string;
  projectId?: string;
  limit?: number;
  mode?: SearchMode;
}): Promise<LearningHit[]> {
  const ctx = await getActionContext();
  const limit = args.limit ?? 20;
  const mode = args.mode ?? "hybrid";

  const hits = await searchHybrid(
    db,
    args.query,
    "project_learnings",
    {
      organizationId: ctx.organizationId,
      limit,
    },
    weightsFor(mode),
  );
  if (hits.length === 0) return [];

  const ids = hits.map((h) => h.record.id);
  const rows = await db
    .select()
    .from(projectLearnings)
    .where(
      and(
        eq(projectLearnings.organizationId, ctx.organizationId),
        inArray(projectLearnings.id, ids),
        isNull(projectLearnings.deletedAt),
        args.projectId ? eq(projectLearnings.projectId, args.projectId) : undefined,
      ),
    );
  const byId = new Map(rows.map((r) => [r.id, r]));

  return hits
    .map((h) => {
      const row = byId.get(h.record.id);
      if (!row) return null;
      return {
        id: row.id,
        body: row.body,
        pinned: row.pinOrder !== null,
        projectId: row.projectId,
        createdAt: row.createdAt,
        score: h.score,
      } satisfies LearningHit;
    })
    .filter((h): h is LearningHit => h !== null);
}

// ─── Plans ──────────────────────────────────────────────────────────────

export interface PlanHit {
  id: string;
  slug: string;
  kind: PlanKind;
  status: PlanStatus;
  title: string;
  summary: string | null;
  projectId: string;
  score: number;
}

export async function searchPlans(args: {
  query: string;
  projectId?: string;
  kinds?: PlanKind[];
  statuses?: PlanStatus[];
  limit?: number;
  mode?: SearchMode;
}): Promise<PlanHit[]> {
  const ctx = await getActionContext();
  const limit = args.limit ?? 20;
  const mode = args.mode ?? "hybrid";

  const hits = await searchHybrid(
    db,
    args.query,
    "plans",
    { organizationId: ctx.organizationId, limit },
    weightsFor(mode),
  );
  if (hits.length === 0) return [];

  const ids = hits.map((h) => h.record.id);
  const rows = await db
    .select()
    .from(plans)
    .where(
      and(
        eq(plans.organizationId, ctx.organizationId),
        inArray(plans.id, ids),
        args.projectId ? eq(plans.projectId, args.projectId) : undefined,
        args.kinds && args.kinds.length > 0 ? inArray(plans.kind, args.kinds) : undefined,
        args.statuses && args.statuses.length > 0
          ? inArray(plans.status, args.statuses)
          : undefined,
      ),
    );
  const byId = new Map(rows.map((r) => [r.id, r]));

  return hits
    .map((h) => {
      const row = byId.get(h.record.id);
      if (!row) return null;
      return {
        id: row.id,
        slug: row.slug,
        kind: row.kind,
        status: row.status,
        title: row.title,
        summary: row.summary,
        projectId: row.projectId,
        score: h.score,
      } satisfies PlanHit;
    })
    .filter((h): h is PlanHit => h !== null);
}

// ─── Outcomes ───────────────────────────────────────────────────────────

export interface OutcomeHit {
  id: string;
  verdict: SkillOutcomeVerdict;
  severity: string | null;
  rationale: string | null;
  skillSlug: string | null;
  projectId: string | null;
  recordedAt: Date;
  /** Outcomes are scored by full-text only — embeddings aren't generated for ledger rows. */
  score: number;
}

/**
 * `skill_outcomes` is searched via SQL ILIKE / FTS — we don't embed
 * ledger rows because they're short, structured, and the `rationale`
 * field is the only text payload worth fuzzy-matching. Vector recall
 * would over-fit on the small token surface.
 */
export async function searchOutcomes(args: {
  query: string;
  projectId?: string;
  verdicts?: SkillOutcomeVerdict[];
  range?: { from: Date; to: Date };
  limit?: number;
}): Promise<OutcomeHit[]> {
  const ctx = await getActionContext();
  const limit = args.limit ?? 20;
  const q = `%${args.query.toLowerCase()}%`;

  const rows = await db
    .select({
      id: skillOutcomes.id,
      verdict: skillOutcomes.verdict,
      severity: skillOutcomes.severity,
      rationale: skillOutcomes.rationale,
      skillSlug: skills.slug,
      projectId: skillOutcomes.projectId,
      recordedAt: skillOutcomes.recordedAt,
    })
    .from(skillOutcomes)
    .leftJoin(skills, eq(skills.id, skillOutcomes.skillId))
    .where(
      and(
        eq(skillOutcomes.organizationId, ctx.organizationId),
        // Exclude signal rows (prompt_quality_signal) — they have null verdict.
        isNotNull(skillOutcomes.verdict),
        sql`lower(coalesce(${skillOutcomes.rationale}, '')) LIKE ${q}`,
        args.projectId ? eq(skillOutcomes.projectId, args.projectId) : undefined,
        args.verdicts && args.verdicts.length > 0
          ? inArray(skillOutcomes.verdict, args.verdicts)
          : undefined,
        args.range ? gte(skillOutcomes.recordedAt, args.range.from) : undefined,
        args.range ? lte(skillOutcomes.recordedAt, args.range.to) : undefined,
      ),
    )
    .orderBy(desc(skillOutcomes.recordedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    // Non-null due to isNotNull predicate above.
    verdict: r.verdict as SkillOutcomeVerdict,
    severity: r.severity,
    rationale: r.rationale,
    skillSlug: r.skillSlug,
    projectId: r.projectId,
    recordedAt: r.recordedAt,
    score: 1, // SQL-only path — no relative score; rows are time-ordered
  }));
}

// ─── Audit ──────────────────────────────────────────────────────────────

export interface AuditHit {
  id: string;
  action: string;
  actorType: AuditActorType;
  actorName: string | null;
  summary: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
  score: number;
}

/**
 * `audit_logs` is searched via SQL ILIKE on `summary` + `action`. Same
 * reasoning as outcomes: short structured rows, no embedding pipeline.
 */
export async function searchAudit(args: {
  query: string;
  range?: { from: Date; to: Date };
  actorType?: AuditActorType;
  scope?: string;
  limit?: number;
}): Promise<AuditHit[]> {
  const ctx = await getActionContext();
  const limit = args.limit ?? 50;
  const q = `%${args.query.toLowerCase()}%`;

  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      actorType: auditLogs.actorType,
      actorName: auditLogs.actorName,
      summary: auditLogs.summary,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.organizationId, ctx.organizationId),
        sql`(
          lower(coalesce(${auditLogs.summary}, '')) LIKE ${q}
          OR lower(${auditLogs.action}) LIKE ${q}
        )`,
        args.actorType ? eq(auditLogs.actorType, args.actorType) : undefined,
        args.range ? gte(auditLogs.createdAt, args.range.from) : undefined,
        args.range ? lte(auditLogs.createdAt, args.range.to) : undefined,
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    actorType: r.actorType,
    actorName: r.actorName,
    summary: r.summary,
    entityType: r.entityType,
    entityId: r.entityId,
    createdAt: r.createdAt,
    score: 1,
  }));
}
