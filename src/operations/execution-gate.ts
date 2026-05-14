/**
 * Execution gate — pure decision function.
 *
 * Composes (skill autonomy × change risk × rule violations × phase × human
 * override) into a verdict the GitHub Checks API consumes. See
 * `docs/execution-gate-plan.md` for the policy this implements.
 *
 * This file is intentionally side-effect free. Persistence and the
 * GitHub POST live in `evaluatePullRequest` below. The decision logic
 * itself is exported separately so it's table-testable.
 */

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { auditLogs } from "@/db/schema/audit-log";
import {
  type ChangeRisk,
  gateEvaluations,
  type GateEvaluation,
  type GateVerdict,
} from "@/db/schema/gate-evaluation";
import type { ProjectPhase } from "@/db/schema/project";
import type { RuleSeverity } from "@/db/schema/rule";
import { PHASE_GUIDANCE } from "@/domain/phases";

export interface GateInput {
  organizationId: string;
  projectId: string;
  prRef: string;
  prTitle?: string | null;
  prHeadSha?: string | null;

  skillId: string | null;
  /** 0=intern, 1=junior, 2=senior, 3=principal */
  skillLevel: number | null;

  changeRisk: ChangeRisk;
  ruleViolations: Array<{ ruleId: string; severity: RuleSeverity }>;
  phase: ProjectPhase;
  hasHumanApproval: boolean;
}

export interface GateVerdictResult {
  verdict: GateVerdict;
  reason: string;
  details: string[];
}

const LEVEL_LABEL = ["intern", "junior", "senior", "principal"] as const;

/** The 5-rule policy from `docs/execution-gate-plan.md`. Pure function. */
export function decideExecutionGate(input: GateInput): GateVerdictResult {
  const details: string[] = [];

  // Rule 1: any error-severity rule violation → failure (autonomy never
  // overrides a hard rule).
  const errors = input.ruleViolations.filter((r) => r.severity === "error");
  if (errors.length > 0) {
    return {
      verdict: "failure",
      reason: `${errors.length} error-severity rule violation${errors.length === 1 ? "" : "s"}`,
      details: errors.map((e) => `error: rule ${e.ruleId} violated`),
    };
  }

  // Rule 2: phase mismatch — code changes are forbidden outside the
  // development phase per the discipline model (FORBIDDEN list).
  if (input.phase !== "development") {
    return {
      verdict: "failure",
      reason: `Code changes are forbidden during the ${input.phase} phase`,
      details: [
        `Current phase: ${input.phase}`,
        ...PHASE_GUIDANCE[input.phase].forbidden.slice(0, 3).map((f) => `forbidden: ${f}`),
      ],
    };
  }

  // Rule 3: human approval honours all other rules.
  if (input.hasHumanApproval) {
    return {
      verdict: "success",
      reason: "Approved by human reviewer",
      details: ["Human override recorded — autonomy thresholds bypassed for this PR."],
    };
  }

  // Surface warnings inline (info severity is silently ignored; warn is noted).
  const warns = input.ruleViolations.filter((r) => r.severity === "warn");
  for (const w of warns) details.push(`warn: rule ${w.ruleId} (not blocking)`);

  // Rule 4: no skill attribution → neutral. Coznt does not block what it
  // can't reason about; existing CI does its thing.
  if (input.skillId === null || input.skillLevel === null) {
    return {
      verdict: "neutral",
      reason: "No skill attribution — coznt has no autonomy signal for this PR",
      details: [
        "Add a `Made-by: <skill-slug>` trailer to a commit on this PR if you want autonomy-based gating.",
        ...details,
      ],
    };
  }

  // Rule 5: autonomy × risk threshold.
  const levelLabel = LEVEL_LABEL[input.skillLevel] ?? "intern";
  const allow = isAllowedByLevel(input.skillLevel, input.changeRisk);
  if (allow) {
    return {
      verdict: "success",
      reason: `${levelLabel} skill cleared for ${input.changeRisk}-risk change`,
      details: [
        `Originating skill: autonomy ${levelLabel}`,
        `Change risk: ${input.changeRisk}`,
        ...details,
      ],
    };
  }
  return {
    verdict: "failure",
    reason: `${levelLabel} skill not authorised for ${input.changeRisk}-risk change`,
    details: [
      `Originating skill: autonomy ${levelLabel}`,
      `Change risk: ${input.changeRisk}`,
      `Required level for ${input.changeRisk} changes: ${minLevelFor(input.changeRisk)} or higher`,
      "Get an explicit human approval to bypass, or split the PR into lower-risk pieces.",
      ...details,
    ],
  };
}

function isAllowedByLevel(level: number, risk: ChangeRisk): boolean {
  if (level >= 3) return true; // principal: all
  if (level === 2) return risk !== "high"; // senior: low/medium
  if (level === 1) return risk === "low"; // junior: low
  return false; // intern: nothing
}

function minLevelFor(risk: ChangeRisk): string {
  if (risk === "high") return "principal";
  if (risk === "medium") return "senior";
  return "junior";
}

/**
 * Evaluate + persist. Appends a row to `gate_evaluations` and writes an
 * `audit_log` entry so the verdict is queryable from the /audit screen.
 * The GitHub Checks POST is the caller's responsibility (it needs a
 * GitHub App installation token, which the webhook handler owns).
 */
export async function evaluatePullRequest(input: GateInput): Promise<{
  evaluation: GateEvaluation;
  verdict: GateVerdictResult;
}> {
  const verdict = decideExecutionGate(input);

  const [evaluation] = await db
    .insert(gateEvaluations)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      prRef: input.prRef,
      prTitle: input.prTitle ?? null,
      prHeadSha: input.prHeadSha ?? null,
      skillId: input.skillId,
      autonomyAtEval: input.skillLevel === null ? null : String(input.skillLevel),
      verdict: verdict.verdict,
      reason: verdict.reason,
      details: verdict.details,
      changeRisk: input.changeRisk,
      humanOverride: input.hasHumanApproval,
    })
    .returning();

  await db.insert(auditLogs).values({
    organizationId: input.organizationId,
    actorType: "system",
    actorName: "execution-gate",
    action: `execution_gate.${verdict.verdict}`,
    entityType: "pull_request",
    entityId: input.prRef,
    summary: `${input.prRef}: ${verdict.reason}`,
    after: {
      verdict: verdict.verdict,
      reason: verdict.reason,
      skillLevel: input.skillLevel,
      changeRisk: input.changeRisk,
      humanOverride: input.hasHumanApproval,
    } as Record<string, unknown>,
  });

  return { evaluation, verdict };
}

/** Latest verdict per (projectId, prRef). Used for "current state" reads. */
export async function getLatestEvaluation(
  projectId: string,
  prRef: string,
): Promise<GateEvaluation | null> {
  const [row] = await db
    .select()
    .from(gateEvaluations)
    .where(and(eq(gateEvaluations.projectId, projectId), eq(gateEvaluations.prRef, prRef)))
    .orderBy(desc(gateEvaluations.evaluatedAt))
    .limit(1);
  return row ?? null;
}

/**
 * Count of currently-blocked PRs for a skill, scoped to one project.
 * "Currently blocked" = the latest evaluation for each prRef is `failure`
 * AND that latest row is attributed to the skill.
 *
 * Used by the /skills/[id] surface ("3 PRs blocked by recent demotion").
 */
export async function countBlockedPrsForSkill(
  organizationId: string,
  skillId: string,
  projectId: string | null,
): Promise<number> {
  // v1 implementation: fetch failure rows for this skill, dedupe by prRef
  // keeping only the latest per prRef. The skill_idx makes the filter cheap.
  // A real `DISTINCT ON` SQL would be faster for high cardinality; v1 is fine.
  const filters = [
    eq(gateEvaluations.organizationId, organizationId),
    eq(gateEvaluations.skillId, skillId),
  ];
  if (projectId) filters.push(eq(gateEvaluations.projectId, projectId));
  const rows = await db
    .select()
    .from(gateEvaluations)
    .where(and(...filters))
    .orderBy(desc(gateEvaluations.evaluatedAt))
    .limit(500);

  const latestPerPr = new Map<string, GateEvaluation>();
  for (const r of rows) {
    if (!latestPerPr.has(r.prRef)) latestPerPr.set(r.prRef, r);
  }
  let blocked = 0;
  for (const r of latestPerPr.values()) {
    if (r.verdict === "failure" && !r.humanOverride) blocked += 1;
  }
  return blocked;
}
