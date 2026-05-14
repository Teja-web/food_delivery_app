/**
 * Skill autonomy — progressive autonomy ledger.
 *
 * Borrowed from ai-sdlc-framework `spec/autonomy.md`; see
 * `docs/borrowings-from-ai-sdlc-framework.md` section 3.
 *
 * Per-project: autonomy is scored per (skillId, projectId) pair. A skill that
 * earns senior-level on a docs-only repo restarts at intern on a payments
 * service. NULL projectId is reserved for legacy / org-wide rows; new code
 * paths must always populate it.
 *
 * Pipeline:
 *
 *   invokeSkill() → recordSkillOutcome()  ── PG trigger ──▶ pgmq
 *                                                            │
 *                                                            ▼
 *                              recomputeSkillAutonomy(skillId, projectId)
 *                                                            │
 *                                                            ▼
 *                                          upsert skill_autonomy row
 *                                          keyed by (skillId, projectId)
 *
 * Defaults (constants below): 30-day window, >=90% success and 0 critical
 * incidents and >=14 days at current level to promote; immediate demotion on
 * any verdict at severity=critical. New (skill, project) pairs default to
 * level 0 — we don't eagerly insert rows; `getSkillAutonomy()` returns an
 * in-memory default when no row exists yet.
 */

import { and, desc, eq, gte, isNull, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import {
  skillOutcomes,
  type SkillOutcomeSeverity,
  type SkillOutcomeSourceKind,
  type SkillOutcomeVerdict,
} from "@/db/schema/skill-outcome";
import { skillAutonomy } from "@/db/schema/skill-autonomy";
import { skills } from "@/db/schema/skill";
import { projects } from "@/db/schema/project";
import type { AssessorResult } from "@/domain/outcomes";

export const LEVEL_NAMES = ["intern", "junior", "senior", "principal"] as const;
export type LevelName = (typeof LEVEL_NAMES)[number];

export const LEVEL_BLURBS: Record<LevelName, string> = {
  intern: "read-only, no auto-approve",
  junior: "PRs need human review",
  senior: "auto-merge low-complexity",
  principal: "minimal oversight",
};

const WINDOW_DAYS = 30;
const PROMOTE_SUCCESS_RATE = 0.9;
const PROMOTE_MIN_AT_LEVEL_DAYS = 14;
const REVIEW_INTERVAL_HOURS = 24;
const MAX_LEVEL = 3;
const MIN_LEVEL = 0;
const MIN_SAMPLES_FOR_PROMOTION = 5;

function projectIdMatches(column: AnyPgColumn, projectId: string | null): SQL {
  return projectId === null ? isNull(column) : eq(column, projectId);
}

export interface RecordSkillOutcomeInput {
  skillId: string;
  /** Project the outcome belongs to. Pass null for legacy / org-wide invocations. */
  projectId: string | null;
  invocationId?: string | null;
  verdict: SkillOutcomeVerdict;
  severity?: SkillOutcomeSeverity | null;
}

/**
 * Append a verdict to the ledger. Org id is looked up from the skill row to
 * avoid forcing callers to pass it — invokeSkill() already has the org in
 * context but the function is also called from worker tasks.
 */
export async function recordSkillOutcome(input: RecordSkillOutcomeInput) {
  const skill = await db.query.skills.findFirst({
    where: eq(skills.id, input.skillId),
    columns: { id: true, organizationId: true },
  });
  if (!skill) throw new Error(`Skill ${input.skillId} not found`);

  const [row] = await db
    .insert(skillOutcomes)
    .values({
      organizationId: skill.organizationId,
      skillId: input.skillId,
      projectId: input.projectId,
      invocationId: input.invocationId ?? null,
      verdict: input.verdict,
      severity: input.severity ?? null,
      sourceKind: "invocation",
    })
    .returning();
  return row;
}

export interface RecordAssessorOutcomeInput {
  skillId: string;
  projectId: string | null;
  sourceKind: Exclude<SkillOutcomeSourceKind, "invocation">;
  /** Stable origin reference — `github:owner/repo#N` or `deployment:<id>`. */
  sourceRef: string;
  result: AssessorResult;
}

/**
 * Persist a deterministic-assessor outcome. Idempotent on
 * `(skill_id, source_kind, source_ref)` — retries do not double-write.
 *
 * Returns `null` for `verdict === null` results (the caller's signal said
 * "not yet actionable") and for conflict-on-insert (a prior tick already
 * wrote this outcome).
 */
export async function recordAssessorOutcome(input: RecordAssessorOutcomeInput) {
  if (input.result.verdict === null) return null;

  const skill = await db.query.skills.findFirst({
    where: eq(skills.id, input.skillId),
    columns: { id: true, organizationId: true },
  });
  if (!skill) throw new Error(`Skill ${input.skillId} not found`);

  const inserted = await db
    .insert(skillOutcomes)
    .values({
      organizationId: skill.organizationId,
      skillId: input.skillId,
      projectId: input.projectId,
      verdict: input.result.verdict,
      severity: input.result.severity,
      sourceKind: input.sourceKind,
      sourceRef: input.sourceRef,
      rationale: input.result.rationale,
    })
    .onConflictDoNothing({
      target: [skillOutcomes.skillId, skillOutcomes.sourceKind, skillOutcomes.sourceRef],
      where: sql`${skillOutcomes.sourceRef} is not null`,
    })
    .returning();
  return inserted[0] ?? null;
}

export interface SkillAutonomyState {
  skillId: string;
  projectId: string | null;
  organizationId: string | null;
  level: number;
  levelName: LevelName;
  levelSetAt: Date;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  lastReason: string | null;
}

function asState(
  skillId: string,
  projectId: string | null,
  organizationId: string | null,
  row: {
    level: number;
    levelSetAt: Date;
    lastReviewedAt: Date | null;
    nextReviewAt: Date | null;
    lastReason: string | null;
  },
): SkillAutonomyState {
  return {
    skillId,
    projectId,
    organizationId,
    level: row.level,
    levelName: LEVEL_NAMES[row.level] ?? "intern",
    levelSetAt: row.levelSetAt,
    lastReviewedAt: row.lastReviewedAt,
    nextReviewAt: row.nextReviewAt,
    lastReason: row.lastReason,
  };
}

/**
 * Returns the current autonomy row for a (skill, project) pair, or a
 * synthesised level-0 default when no row exists yet. Pass `projectId = null`
 * to get the legacy / org-wide row. Callers that need to *write* should
 * always upsert via `recomputeSkillAutonomy()`.
 */
export async function getSkillAutonomy(
  skillId: string,
  projectId: string | null,
): Promise<SkillAutonomyState> {
  const row = await db.query.skillAutonomy.findFirst({
    where: and(
      eq(skillAutonomy.skillId, skillId),
      projectIdMatches(skillAutonomy.projectId, projectId),
    ),
  });
  if (row) {
    return asState(skillId, row.projectId, row.organizationId, row);
  }
  return {
    skillId,
    projectId,
    organizationId: null,
    level: 0,
    levelName: "intern",
    levelSetAt: new Date(0),
    lastReviewedAt: null,
    nextReviewAt: null,
    lastReason: null,
  };
}

interface WindowStats {
  total: number;
  successes: number;
  rollbacks: number;
  incidents: number;
  criticalIncidents: number;
  successRate: number;
}

async function loadWindowStats(
  skillId: string,
  projectId: string | null,
  windowDays = WINDOW_DAYS,
): Promise<WindowStats> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      verdict: skillOutcomes.verdict,
      severity: skillOutcomes.severity,
    })
    .from(skillOutcomes)
    .where(
      and(
        eq(skillOutcomes.skillId, skillId),
        projectIdMatches(skillOutcomes.projectId, projectId),
        gte(skillOutcomes.recordedAt, since),
      ),
    );

  let successes = 0;
  let rollbacks = 0;
  let incidents = 0;
  let criticalIncidents = 0;
  for (const r of rows) {
    if (r.verdict === "success") successes++;
    else if (r.verdict === "rolled_back") rollbacks++;
    else if (r.verdict === "incident") {
      incidents++;
      if (r.severity === "critical") criticalIncidents++;
    }
  }
  const total = rows.length;
  return {
    total,
    successes,
    rollbacks,
    incidents,
    criticalIncidents,
    successRate: total === 0 ? 0 : successes / total,
  };
}

export interface RecomputeResult {
  level: number;
  levelName: LevelName;
  reason: string;
  promoted: boolean;
  demoted: boolean;
  stats: WindowStats;
}

/**
 * Apply promotion/demotion rules to a (skill, project) pair's autonomy
 * ledger and upsert the result. Idempotent — safe to call repeatedly from
 * the worker.
 */
export async function recomputeSkillAutonomy(
  skillId: string,
  projectId: string | null,
): Promise<RecomputeResult> {
  const skill = await db.query.skills.findFirst({
    where: eq(skills.id, skillId),
    columns: { id: true, organizationId: true },
  });
  if (!skill) throw new Error(`Skill ${skillId} not found`);

  const current = await getSkillAutonomy(skillId, projectId);
  const stats = await loadWindowStats(skillId, projectId);
  const now = new Date();
  const nextReviewAt = new Date(now.getTime() + REVIEW_INTERVAL_HOURS * 60 * 60 * 1000);

  let newLevel = current.level;
  let reason = `holding at ${current.levelName}`;
  let promoted = false;
  let demoted = false;

  // 1. Immediate demotion on critical incident.
  if (stats.criticalIncidents > 0 && current.level > MIN_LEVEL) {
    newLevel = MIN_LEVEL;
    demoted = true;
    reason = `demoted to ${LEVEL_NAMES[newLevel]}: ${stats.criticalIncidents} critical incident(s) in last ${WINDOW_DAYS}d`;
  } else if (current.level < MAX_LEVEL) {
    // 2. Promotion gate: meets success rate, no critical incidents, and
    //    has been at current level long enough.
    const daysAtLevel =
      current.levelSetAt.getTime() === 0
        ? Number.POSITIVE_INFINITY
        : (now.getTime() - current.levelSetAt.getTime()) / (24 * 60 * 60 * 1000);
    const meetsRate = stats.successRate >= PROMOTE_SUCCESS_RATE;
    const meetsSamples = stats.successes >= MIN_SAMPLES_FOR_PROMOTION;
    const meetsTime = daysAtLevel >= PROMOTE_MIN_AT_LEVEL_DAYS;
    const safe = stats.criticalIncidents === 0;

    if (meetsRate && meetsSamples && meetsTime && safe) {
      newLevel = current.level + 1;
      promoted = true;
      reason = `promoted to ${LEVEL_NAMES[newLevel]}: ${Math.round(stats.successRate * 100)}% success across ${stats.total} runs (${WINDOW_DAYS}d)`;
    } else if (!meetsTime) {
      reason = `holding at ${current.levelName}: ${Math.floor(daysAtLevel)}d at level (<${PROMOTE_MIN_AT_LEVEL_DAYS}d)`;
    } else if (!meetsSamples) {
      reason = `holding at ${current.levelName}: only ${stats.successes} successes in window (<${MIN_SAMPLES_FOR_PROMOTION})`;
    } else if (!meetsRate) {
      reason = `holding at ${current.levelName}: ${Math.round(stats.successRate * 100)}% success (<${Math.round(PROMOTE_SUCCESS_RATE * 100)}%)`;
    }
  }

  const levelChanged = newLevel !== current.level;
  const levelSetAt = levelChanged ? now : current.levelSetAt.getTime() === 0 ? now : current.levelSetAt;

  await db
    .insert(skillAutonomy)
    .values({
      skillId,
      projectId,
      organizationId: skill.organizationId,
      level: newLevel,
      levelSetAt,
      lastReviewedAt: now,
      nextReviewAt,
      lastReason: reason,
    })
    .onConflictDoUpdate({
      target: [skillAutonomy.skillId, skillAutonomy.projectId],
      set: {
        level: newLevel,
        levelSetAt,
        lastReviewedAt: now,
        nextReviewAt,
        lastReason: reason,
      },
    });

  // Demote-triggered re-evaluation: every open PR attributed to this skill
  // on this project gets re-graded against the new (lower) autonomy level.
  // PRs that were `success` at senior and would now be `failure` at junior
  // flip immediately — the autonomy ledger gains physical teeth.
  if (demoted && projectId) {
    await reevaluateOpenPrsForSkill(skill.organizationId, skillId, projectId).catch((err) => {
      // Demotion succeeded; re-eval is best-effort. Log and move on.
      console.error("[recomputeSkillAutonomy] re-eval after demote failed:", err);
    });
  }

  return {
    level: newLevel,
    levelName: LEVEL_NAMES[newLevel] ?? "intern",
    reason,
    promoted,
    demoted,
    stats,
  };
}

/**
 * Find every PR with a currently-open verdict attributed to this skill on
 * this project, and write a fresh evaluation row that records the new
 * (post-demote) autonomy level. The new verdict is computed against the
 * stored prior risk + rule signal — we don't re-fetch GitHub. That's
 * faithful enough for the demote signal: the autonomy level is what
 * changed, not the diff.
 *
 * Imported lazily to avoid a cycle between `skill-autonomy.ts` and
 * `execution-gate.ts` (which imports `getSkillAutonomy` for its policy).
 */
async function reevaluateOpenPrsForSkill(
  organizationId: string,
  skillId: string,
  projectId: string,
): Promise<void> {
  const { db: cdb } = await import("@/db/client");
  const { gateEvaluations } = await import("@/db/schema/gate-evaluation");
  const { decideExecutionGate } = await import("./execution-gate");
  const { auditLogs } = await import("@/db/schema/audit-log");
  const { projects } = await import("@/db/schema/project");
  const { desc, and: andOp, eq: eqOp } = await import("drizzle-orm");

  const recent = await cdb
    .select()
    .from(gateEvaluations)
    .where(andOp(eqOp(gateEvaluations.organizationId, organizationId), eqOp(gateEvaluations.skillId, skillId), eqOp(gateEvaluations.projectId, projectId)))
    .orderBy(desc(gateEvaluations.evaluatedAt))
    .limit(200);

  // Latest verdict per prRef.
  const latest = new Map<string, (typeof recent)[number]>();
  for (const r of recent) if (!latest.has(r.prRef)) latest.set(r.prRef, r);

  const project = await cdb.query.projects.findFirst({
    where: andOp(eqOp(projects.id, projectId), eqOp(projects.organizationId, organizationId)),
  });
  if (!project) return;

  const newLevel = (await getSkillAutonomy(skillId, projectId)).level;

  for (const prior of latest.values()) {
    const verdict = decideExecutionGate({
      organizationId,
      projectId,
      prRef: prior.prRef,
      skillId,
      skillLevel: newLevel,
      changeRisk: prior.changeRisk,
      ruleViolations: [],
      phase: project.phase,
      hasHumanApproval: prior.humanOverride,
    });
    if (verdict.verdict === prior.verdict) continue; // no change; skip

    await cdb.insert(gateEvaluations).values({
      organizationId,
      projectId,
      prRef: prior.prRef,
      prTitle: prior.prTitle,
      prHeadSha: prior.prHeadSha,
      skillId,
      autonomyAtEval: String(newLevel),
      verdict: verdict.verdict,
      reason: `Re-evaluated after autonomy change — ${verdict.reason}`,
      details: verdict.details,
      changeRisk: prior.changeRisk,
      humanOverride: prior.humanOverride,
    });
    await cdb.insert(auditLogs).values({
      organizationId,
      actorType: "system",
      actorName: "execution-gate",
      action: `execution_gate.reevaluated`,
      entityType: "pull_request",
      entityId: prior.prRef,
      summary: `${prior.prRef}: ${prior.verdict} → ${verdict.verdict} (autonomy demote)`,
      after: { newLevel, oldVerdict: prior.verdict, newVerdict: verdict.verdict } as Record<string, unknown>,
    });
  }
}

/**
 * Trailing-30d outcomes count and a daily sparkline (success-only) for one
 * (skill, project) pair. Pass `projectId = null` for the legacy / org-wide
 * aggregate.
 */
export async function getSkillStats30d(
  skillId: string,
  projectId: string | null,
): Promise<{
  success: number;
  rollback: number;
  incident: number;
  windowDays: number;
  sparkline: number[];
}> {
  const windowDays = 30;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ verdict: skillOutcomes.verdict, recordedAt: skillOutcomes.recordedAt })
    .from(skillOutcomes)
    .where(
      and(
        eq(skillOutcomes.skillId, skillId),
        projectIdMatches(skillOutcomes.projectId, projectId),
        gte(skillOutcomes.recordedAt, since),
      ),
    );

  let success = 0;
  let rollback = 0;
  let incident = 0;
  const dayBuckets = Array.from({ length: windowDays }, () => 0);
  const start = since.getTime();
  for (const r of rows) {
    if (r.verdict === "success") success += 1;
    else if (r.verdict === "rolled_back") rollback += 1;
    else if (r.verdict === "incident") incident += 1;
    const idx = Math.min(
      windowDays - 1,
      Math.max(0, Math.floor((r.recordedAt.getTime() - start) / (24 * 60 * 60 * 1000))),
    );
    if (r.verdict === "success") dayBuckets[idx] += 1;
  }
  return { success, rollback, incident, windowDays, sparkline: dayBuckets };
}

/**
 * Recent outcomes for a single skill — the "receipts" behind the autonomy
 * level. Joins the project name so the detail page can render where the
 * outcome was produced; left-joins so legacy / org-wide rows (projectId =
 * null) still render with no project label.
 */
export async function getRecentSkillOutcomes(
  skillId: string,
  limit = 20,
): Promise<
  Array<{
    id: string;
    verdict: SkillOutcomeVerdict;
    severity: SkillOutcomeSeverity | null;
    recordedAt: Date;
    projectId: string | null;
    projectName: string | null;
    invocationId: string | null;
  }>
> {
  const rows = await db
    .select({
      id: skillOutcomes.id,
      verdict: skillOutcomes.verdict,
      severity: skillOutcomes.severity,
      recordedAt: skillOutcomes.recordedAt,
      projectId: skillOutcomes.projectId,
      projectName: projects.name,
      invocationId: skillOutcomes.invocationId,
    })
    .from(skillOutcomes)
    .leftJoin(projects, eq(projects.id, skillOutcomes.projectId))
    .where(eq(skillOutcomes.skillId, skillId))
    .orderBy(desc(skillOutcomes.recordedAt))
    .limit(limit);
  return rows;
}

/**
 * All per-project autonomy rows for a single skill — the cross-project
 * rollup pane (Milestone B). Returns one row per (skill, project) pair
 * the skill has earned trust on, plus the org-wide row when present.
 *
 * Excludes synthetic level-0 defaults: the skill has to have *actually*
 * been promoted/demoted on a project for it to show up here. New pairs
 * appear once `recomputeSkillAutonomy` has run for them at least once.
 */
export async function getSkillAutonomyAcrossProjects(
  skillId: string,
): Promise<
  Array<{
    projectId: string | null;
    organizationId: string;
    level: number;
    levelName: LevelName;
    levelSetAt: Date;
    lastReviewedAt: Date | null;
    lastReason: string | null;
  }>
> {
  const rows = await db
    .select({
      projectId: skillAutonomy.projectId,
      organizationId: skillAutonomy.organizationId,
      level: skillAutonomy.level,
      levelSetAt: skillAutonomy.levelSetAt,
      lastReviewedAt: skillAutonomy.lastReviewedAt,
      lastReason: skillAutonomy.lastReason,
    })
    .from(skillAutonomy)
    .where(eq(skillAutonomy.skillId, skillId))
    .orderBy(desc(skillAutonomy.level), desc(skillAutonomy.levelSetAt));
  return rows.map((r) => ({
    ...r,
    levelName: LEVEL_NAMES[r.level] ?? "intern",
  }));
}

/**
 * Recent autonomy events from the ledger. v1 limitation: returns one event
 * per (skill, project) pair (the most recent state change). A proper history
 * table will replace this when needed.
 */
export async function getRecentAutonomyEvents(
  organizationId: string,
  days = 14,
): Promise<
  Array<{
    skillId: string;
    projectId: string | null;
    level: number;
    levelSetAt: Date;
    lastReason: string | null;
  }>
> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db
    .select({
      skillId: skillAutonomy.skillId,
      projectId: skillAutonomy.projectId,
      level: skillAutonomy.level,
      levelSetAt: skillAutonomy.levelSetAt,
      lastReason: skillAutonomy.lastReason,
    })
    .from(skillAutonomy)
    .where(
      and(eq(skillAutonomy.organizationId, organizationId), gte(skillAutonomy.levelSetAt, since)),
    );
}
