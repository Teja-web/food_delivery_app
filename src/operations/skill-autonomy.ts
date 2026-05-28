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

import { and, desc, eq, gte, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { attenuationFactorForProject } from "./prompt-log";
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
import { emitDomainEvent, eventKindForOutcome } from "@/lib/events/emit";

import {
  LEVEL_NAMES as SHARED_LEVEL_NAMES,
  LEVEL_BLURBS as SHARED_LEVEL_BLURBS,
  levelToName,
  WINDOW_DAYS,
  PROMOTE_SUCCESS_RATE,
  PROMOTE_MIN_AT_LEVEL_DAYS,
  REVIEW_INTERVAL_HOURS,
  MAX_LEVEL,
  MIN_LEVEL,
  MIN_SAMPLES_FOR_PROMOTION,
} from "./autonomy-constants";

export const LEVEL_NAMES = SHARED_LEVEL_NAMES;
export type LevelName = (typeof LEVEL_NAMES)[number];

export const LEVEL_BLURBS = SHARED_LEVEL_BLURBS;

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

  const kind = eventKindForOutcome("invocation", input.verdict);
  if (kind) {
    await emitDomainEvent({
      organizationId: skill.organizationId,
      kind,
      summary: `${kind} · skill ${input.skillId}`,
      actorId: input.skillId,
      entityType: "skill_outcome",
      entityId: row.id,
      payload: {
        skillId: input.skillId,
        projectId: input.projectId,
        verdict: input.verdict,
        severity: input.severity ?? null,
        sourceKind: "invocation",
      },
    });
  }

  return row;
}

export interface RecordPromptQualitySignalInput {
  organizationId: string;
  projectId: string;
  /** PromptLog row id that originated this signal. */
  promptLogId: string;
  /** Score (0–100) from the rubric. */
  score: number;
  /** Tier label — only NEEDS_IMPROVEMENT / POOR produce signal rows. */
  tier: "NEEDS_IMPROVEMENT" | "POOR";
}

/**
 * Append a `prompt_quality_signal` outcome row. `skillId=null` (project-level
 * signal) and `verdict=null` (signal-only — never rolls into success counts).
 * Idempotent on `(skill_id, source_kind, source_ref)` where
 * `source_ref = "prompt:<id>"`.
 */
export async function recordPromptQualitySignal(input: RecordPromptQualitySignalInput) {
  const inserted = await db
    .insert(skillOutcomes)
    .values({
      organizationId: input.organizationId,
      skillId: null,
      projectId: input.projectId,
      verdict: null,
      severity: null,
      sourceKind: "prompt_quality_signal",
      sourceRef: `prompt:${input.promptLogId}`,
      rationale: `Prompt scored ${input.score}/${input.tier}`,
      promptLogId: input.promptLogId,
    })
    .onConflictDoNothing({
      target: [skillOutcomes.skillId, skillOutcomes.sourceKind, skillOutcomes.sourceRef],
      where: sql`${skillOutcomes.sourceRef} is not null`,
    })
    .returning();
  return inserted[0] ?? null;
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
  const row = inserted[0];
  if (!row) return null;

  const kind = eventKindForOutcome(input.sourceKind, input.result.verdict);
  if (kind) {
    await emitDomainEvent({
      organizationId: skill.organizationId,
      kind,
      summary: `${kind} · ${input.sourceRef}`,
      actorId: input.skillId,
      entityType: "skill_outcome",
      entityId: row.id,
      payload: {
        skillId: input.skillId,
        projectId: input.projectId,
        verdict: input.result.verdict,
        severity: input.result.severity,
        sourceKind: input.sourceKind,
        sourceRef: input.sourceRef,
      },
    });
  }

  return row;
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
    levelName: levelToName(row.level),
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
    levelName: "observe",
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
        isNotNull(skillOutcomes.verdict),
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

  // Agent-loop signal: sustained low-quality prompts on this project raise
  // the bar for promotion (don't trigger demotion). Project-scoped only —
  // org-wide (projectId=null) recompute is unaffected.
  const attenuation = projectId
    ? await attenuationFactorForProject(skill.organizationId, projectId).catch(() => ({
        factor: 1.0,
        distribution: { good: 0, needsImprovement: 0, poor: 0, total: 0 },
      }))
    : { factor: 1.0, distribution: { good: 0, needsImprovement: 0, poor: 0, total: 0 } };
  const requiredSamples = Math.ceil(MIN_SAMPLES_FOR_PROMOTION * attenuation.factor);

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
    const meetsSamples = stats.successes >= requiredSamples;
    const meetsTime = daysAtLevel >= PROMOTE_MIN_AT_LEVEL_DAYS;
    const safe = stats.criticalIncidents === 0;

    if (meetsRate && meetsSamples && meetsTime && safe) {
      newLevel = current.level + 1;
      promoted = true;
      const attenNote = attenuation.factor > 1.0 ? ` (×${attenuation.factor} prompt attenuation)` : "";
      reason = `promoted to ${LEVEL_NAMES[newLevel]}: ${Math.round(stats.successRate * 100)}% success across ${stats.total} runs (${WINDOW_DAYS}d)${attenNote}`;
    } else if (!meetsTime) {
      reason = `holding at ${current.levelName}: ${Math.floor(daysAtLevel)}d at level (<${PROMOTE_MIN_AT_LEVEL_DAYS}d)`;
    } else if (!meetsSamples) {
      const attenNote = attenuation.factor > 1.0 ? ` (×${attenuation.factor} prompt attenuation)` : "";
      reason = `holding at ${current.levelName}: only ${stats.successes} successes in window (<${requiredSamples}${attenNote})`;
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

  // Emit autonomy.promoted / autonomy.demoted on level change. The ledger
  // event lets SSE subscribers (UI, marketing activity feed) react in real
  // time without polling skill_autonomy.
  if (promoted || demoted) {
    await emitDomainEvent({
      organizationId: skill.organizationId,
      kind: promoted ? "autonomy.promoted" : "autonomy.demoted",
      summary: reason,
      actorId: skillId,
      entityType: "skill_autonomy",
      entityId: skillId,
      payload: {
        skillId,
        projectId,
        fromLevel: current.level,
        toLevel: newLevel,
        fromLevelName: current.levelName,
        toLevelName: levelToName(newLevel),
        reason,
        stats,
      },
    });
  }

  return {
    level: newLevel,
    levelName: levelToName(newLevel),
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
  criticalIncidents: number;
  windowDays: number;
  sparkline: number[];
}> {
  const windowDays = 30;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      verdict: skillOutcomes.verdict,
      severity: skillOutcomes.severity,
      recordedAt: skillOutcomes.recordedAt,
    })
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
  let criticalIncidents = 0;
  const dayBuckets = Array.from({ length: windowDays }, () => 0);
  const start = since.getTime();
  for (const r of rows) {
    if (r.verdict === "success") success += 1;
    else if (r.verdict === "rolled_back") rollback += 1;
    else if (r.verdict === "incident") {
      incident += 1;
      if (r.severity === "critical") criticalIncidents += 1;
    }
    const idx = Math.min(
      windowDays - 1,
      Math.max(0, Math.floor((r.recordedAt.getTime() - start) / (24 * 60 * 60 * 1000))),
    );
    if (r.verdict === "success") dayBuckets[idx] += 1;
  }
  return { success, rollback, incident, criticalIncidents, windowDays, sparkline: dayBuckets };
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
    // skillId NOT NULL filter (signal rows have skillId=null) + recipient skill.
    .where(and(eq(skillOutcomes.skillId, skillId), isNotNull(skillOutcomes.verdict)))
    .orderBy(desc(skillOutcomes.recordedAt))
    .limit(limit);
  return rows as Array<{
    id: string;
    verdict: SkillOutcomeVerdict;
    severity: SkillOutcomeSeverity | null;
    recordedAt: Date;
    projectId: string | null;
    projectName: string | null;
    invocationId: string | null;
  }>;
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
    levelName: levelToName(r.level),
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

/**
 * Aggregate the autonomy posture of every (skill, project) pair on a
 * given project: counts at each level + a recent-incident flag.
 *
 * Used by the portfolio view to surface "this project has skills below
 * Senior" or "this project saw a critical incident this week" without
 * needing per-row drill-down.
 */
export async function getProjectAutonomyAggregate(
  projectId: string,
  organizationId: string,
): Promise<{
  intern: number;
  junior: number;
  senior: number;
  principal: number;
  total: number;
  incidentsLast7d: number;
}> {
  const autonomyRows = await db
    .select({ level: skillAutonomy.level })
    .from(skillAutonomy)
    .where(
      and(
        eq(skillAutonomy.organizationId, organizationId),
        eq(skillAutonomy.projectId, projectId),
      ),
    );

  let intern = 0;
  let junior = 0;
  let senior = 0;
  let principal = 0;
  for (const r of autonomyRows) {
    if (r.level >= 3) principal++;
    else if (r.level >= 2) senior++;
    else if (r.level >= 1) junior++;
    else intern++;
  }
  const total = autonomyRows.length;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const incidentRows = await db
    .select({ id: skillOutcomes.id })
    .from(skillOutcomes)
    .where(
      and(
        eq(skillOutcomes.organizationId, organizationId),
        eq(skillOutcomes.projectId, projectId),
        eq(skillOutcomes.verdict, "incident"),
        gte(skillOutcomes.recordedAt, since),
      ),
    );
  const incidentsLast7d = incidentRows.length;

  return { intern, junior, senior, principal, total, incidentsLast7d };
}
