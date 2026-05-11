/**
 * Skill autonomy — progressive autonomy ledger.
 *
 * Borrowed from ai-sdlc-framework `spec/autonomy.md`; see
 * `docs/borrowings-from-ai-sdlc-framework.md` section 3.
 *
 * Pipeline:
 *
 *   invokeSkill() → recordSkillOutcome()  ── PG trigger ──▶ pgmq
 *                                                            │
 *                                                            ▼
 *                                          recomputeSkillAutonomy(skillId)
 *                                                            │
 *                                                            ▼
 *                                                upsert skill_autonomy row
 *
 * Defaults (constants below): 30-day window, >=90% success and 0 critical
 * incidents and >=14 days at current level to promote; immediate demotion on
 * any verdict at severity=critical. New skills default to level 0 — we don't
 * eagerly insert rows, `getSkillAutonomy()` returns an in-memory default when
 * no row exists yet.
 */

import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { skillOutcomes, type SkillOutcomeVerdict, type SkillOutcomeSeverity } from "@/db/schema/skill-outcome";
import { skillAutonomy } from "@/db/schema/skill-autonomy";
import { skills } from "@/db/schema/skill";

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

export interface RecordSkillOutcomeInput {
  skillId: string;
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
      invocationId: input.invocationId ?? null,
      verdict: input.verdict,
      severity: input.severity ?? null,
    })
    .returning();
  return row;
}

export interface SkillAutonomyState {
  skillId: string;
  organizationId: string | null;
  level: number;
  levelName: LevelName;
  levelSetAt: Date;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  lastReason: string | null;
}

function asState(skillId: string, organizationId: string | null, row: {
  level: number;
  levelSetAt: Date;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  lastReason: string | null;
}): SkillAutonomyState {
  return {
    skillId,
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
 * Returns the current autonomy row, or a synthesised level-0 default when no
 * row exists yet (i.e. the skill has never been reviewed). Callers that need
 * to *write* should always upsert via `recomputeSkillAutonomy()`.
 */
export async function getSkillAutonomy(skillId: string): Promise<SkillAutonomyState> {
  const row = await db.query.skillAutonomy.findFirst({
    where: eq(skillAutonomy.skillId, skillId),
  });
  if (row) {
    return asState(skillId, row.organizationId, row);
  }
  return {
    skillId,
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

async function loadWindowStats(skillId: string, windowDays = WINDOW_DAYS): Promise<WindowStats> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      verdict: skillOutcomes.verdict,
      severity: skillOutcomes.severity,
    })
    .from(skillOutcomes)
    .where(and(eq(skillOutcomes.skillId, skillId), gte(skillOutcomes.recordedAt, since)));

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
 * Apply promotion/demotion rules to a skill's autonomy ledger and upsert
 * the result. Idempotent — safe to call repeatedly from the worker.
 */
export async function recomputeSkillAutonomy(skillId: string): Promise<RecomputeResult> {
  const skill = await db.query.skills.findFirst({
    where: eq(skills.id, skillId),
    columns: { id: true, organizationId: true },
  });
  if (!skill) throw new Error(`Skill ${skillId} not found`);

  const current = await getSkillAutonomy(skillId);
  const stats = await loadWindowStats(skillId);
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
      organizationId: skill.organizationId,
      level: newLevel,
      levelSetAt,
      lastReviewedAt: now,
      nextReviewAt,
      lastReason: reason,
    })
    .onConflictDoUpdate({
      target: skillAutonomy.skillId,
      set: {
        level: newLevel,
        levelSetAt,
        lastReviewedAt: now,
        nextReviewAt,
        lastReason: reason,
      },
    });

  return {
    level: newLevel,
    levelName: LEVEL_NAMES[newLevel] ?? "intern",
    reason,
    promoted,
    demoted,
    stats,
  };
}
