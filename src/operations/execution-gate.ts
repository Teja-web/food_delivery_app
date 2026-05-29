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
import { emitDomainEvent } from "@/lib/events/emit";

function gateEventKind(verdict: GateVerdict): "gate.pass" | "gate.fail" | "gate.neutral" {
  if (verdict === "success") return "gate.pass";
  if (verdict === "failure") return "gate.fail";
  return "gate.neutral";
}

export interface GateInput {
  organizationId: string;
  projectId: string;
  prRef: string;
  prTitle?: string | null;
  prHeadSha?: string | null;

  skillId: string | null;
  /** 0=observe, 1=propose, 2=merge, 3=lead */
  skillLevel: number | null;

  changeRisk: ChangeRisk;
  ruleViolations: Array<{ ruleId: string; severity: RuleSeverity }>;
  phase: ProjectPhase;
  hasHumanApproval: boolean;
  /**
   * When true (per `projects.requireHumanApprovalForMerge`), autonomy
   * cannot stand in for a human reviewer — without an `approved` row the
   * gate emits `failure` so GitHub branch protection blocks the merge.
   * The hasHumanApproval override still wins when set.
   */
  requireHumanApproval?: boolean;

  /**
   * Optional policy override. When provided, replaces the default
   * autonomy → behavior binding for this evaluation. `enforcedByRuleId`
   * is null for default-fallback decisions, non-null when a customer
   * rule was the policy source.
   */
  policy?: {
    minLevel: number;
    enforcedByRuleId: string | null;
  };
}

export interface GateVerdictResult {
  verdict: GateVerdict;
  reason: string;
  details: string[];
  /** Rule id that authorized this verdict, when applicable. */
  enforcedByRuleId?: string | null;
}

const LEVEL_LABEL = ["observe", "propose", "merge", "lead"] as const;

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

  // Rule 3b: project-level "require human approval" lock. When set, autonomy
  // is not allowed to stand in for a reviewer — we exit with `failure` so
  // GitHub branch protection blocks the merge until an approval row decides.
  if (input.requireHumanApproval) {
    return {
      verdict: "failure",
      reason: "Awaiting human approval",
      details: [
        "This project requires explicit human approval before any PR can merge.",
        "Open the coznt approvals inbox and decide the PR's approval row to unblock.",
      ],
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

  // Rule 5: autonomy × risk threshold. Resolved from a customer rule
  // (`policy.minLevel + policy.enforcedByRuleId`) when supplied,
  // otherwise from the default-fallback table.
  const levelLabel = LEVEL_LABEL[input.skillLevel] ?? "observe";
  const required = input.policy?.minLevel ?? defaultMinLevelFor(input.changeRisk);
  const enforcedByRuleId = input.policy?.enforcedByRuleId ?? null;
  const requiredLabel = LEVEL_LABEL[Math.min(required, 3)] ?? "lead";
  const sourceDetail = enforcedByRuleId
    ? `Policy: enforced by rule ${enforcedByRuleId}`
    : `Policy: default fallback`;
  const isAllowed = required !== Infinity && input.skillLevel >= required;

  if (isAllowed) {
    return {
      verdict: "success",
      reason: `${levelLabel} skill cleared for ${input.changeRisk}-risk change`,
      details: [
        `Originating skill: autonomy ${levelLabel}`,
        `Change risk: ${input.changeRisk}`,
        sourceDetail,
        ...details,
      ],
      enforcedByRuleId,
    };
  }
  return {
    verdict: "failure",
    reason: `${levelLabel} skill not authorised for ${input.changeRisk}-risk change`,
    details: [
      `Originating skill: autonomy ${levelLabel}`,
      `Change risk: ${input.changeRisk}`,
      required === Infinity
        ? `Auto-merge disabled for ${input.changeRisk}-risk changes — always requires human approval`
        : `Required minimum autonomy: ${requiredLabel}`,
      sourceDetail,
      "Get an explicit human approval to bypass, or split the PR into lower-risk pieces.",
      ...details,
    ],
    enforcedByRuleId,
  };
}

function defaultMinLevelFor(risk: ChangeRisk): number {
  // Mirrors the pre-policy hardcoded behavior in `isAllowedByLevel`
  // (low → ≥1, medium → ≥2, high → ≥3). Customer-authored
  // `autonomy-threshold` rules override per-row via `input.policy.minLevel`.
  if (risk === "high") return 3; // lead
  if (risk === "medium") return 2; // merge
  return 1; // low — propose (was: propose allowed)
}

/**
 * Evaluate + persist. Resolves the active `autonomy-threshold` policy
 * for this org/project/risk tuple, threads it into the pure decision
 * function, appends a row to `gate_evaluations`, and writes an
 * `audit_log` entry so the verdict is queryable from the /audit screen.
 * The GitHub Checks POST is the caller's responsibility (it needs a
 * GitHub App installation token, which the webhook handler owns).
 */
export async function evaluatePullRequest(input: GateInput): Promise<{
  evaluation: GateEvaluation;
  verdict: GateVerdictResult;
}> {
  const { resolveAutonomyThreshold } = await import("@/operations/autonomy-policy");
  const policy = await resolveAutonomyThreshold({
    organizationId: input.organizationId,
    projectId: input.projectId,
    actionKind: "merge_pr",
    changeRisk: input.changeRisk,
  });

  const verdict = decideExecutionGate({
    ...input,
    policy: { minLevel: policy.minLevel, enforcedByRuleId: policy.enforcedByRuleId },
  });

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
      enforcedByRuleId: verdict.enforcedByRuleId ?? null,
      policySource: policy.source,
    } as Record<string, unknown>,
  });

  await emitDomainEvent({
    organizationId: input.organizationId,
    kind: gateEventKind(verdict.verdict),
    summary: `${input.prRef}: ${verdict.reason}`,
    actorId: input.skillId,
    entityType: "pull_request",
    entityId: input.prRef,
    payload: {
      projectId: input.projectId,
      prRef: input.prRef,
      verdict: verdict.verdict,
      reason: verdict.reason,
      skillId: input.skillId,
      skillLevel: input.skillLevel,
      changeRisk: input.changeRisk,
      humanOverride: input.hasHumanApproval,
      enforcedByRuleId: verdict.enforcedByRuleId ?? null,
    },
  });

  return { evaluation, verdict };
}

/**
 * Cascade a human approval/rejection of a `work_item` PR row back into
 * `gate_evaluations` and GitHub. Without this, the PR's coznt check-run
 * stays stale until the next `synchronize` event re-evaluates — which can
 * be never if the author is waiting for the gate to clear before pushing
 * again. Best-effort: missing prior evaluation / no installation / App
 * unconfigured → we still record the audit trail but skip the GitHub POST.
 */
export async function recordApprovalCheckRun(args: {
  organizationId: string;
  projectId: string;
  prRef: string;
  decision: "approved" | "rejected";
  decidedByName: string;
  note?: string;
}): Promise<void> {
  const match = args.prRef.match(/^github:([^#]+)#(\d+)$/);
  if (!match) return; // not a GitHub PR ref; nothing to cascade
  const ownerRepo = match[1];

  // Latest prior evaluation gives us headSha + skill attribution to carry
  // forward into the new row. If there's no prior eval, we still log the
  // decision but skip the GitHub POST (nothing to post against).
  const prior = await getLatestEvaluation(args.projectId, args.prRef);

  const verdict: GateVerdict = args.decision === "approved" ? "success" : "failure";
  const reason =
    args.decision === "approved"
      ? `Approved by ${args.decidedByName}`
      : `Rejected by ${args.decidedByName}`;
  const details = [
    args.decision === "approved"
      ? "Human reviewer cleared this PR via the coznt approvals inbox."
      : "Human reviewer rejected this PR via the coznt approvals inbox.",
    ...(args.note ? [args.note] : []),
  ];

  const [newEval] = await db
    .insert(gateEvaluations)
    .values({
      organizationId: args.organizationId,
      projectId: args.projectId,
      prRef: args.prRef,
      prTitle: prior?.prTitle ?? null,
      prHeadSha: prior?.prHeadSha ?? null,
      skillId: prior?.skillId ?? null,
      autonomyAtEval: prior?.autonomyAtEval ?? null,
      verdict,
      reason,
      details,
      changeRisk: prior?.changeRisk ?? "low",
      humanOverride: args.decision === "approved",
    })
    .returning();

  await db.insert(auditLogs).values({
    organizationId: args.organizationId,
    actorType: "user",
    actorName: args.decidedByName,
    action: `execution_gate.${verdict}`,
    entityType: "pull_request",
    entityId: args.prRef,
    summary: `${args.prRef}: ${reason}`,
    after: {
      verdict,
      reason,
      humanOverride: args.decision === "approved",
      source: "approval_cascade",
    } as Record<string, unknown>,
  });

  await emitDomainEvent({
    organizationId: args.organizationId,
    kind: gateEventKind(verdict),
    summary: `${args.prRef}: ${reason}`,
    actorId: prior?.skillId ?? null,
    entityType: "pull_request",
    entityId: args.prRef,
    payload: {
      projectId: args.projectId,
      prRef: args.prRef,
      verdict,
      reason,
      humanOverride: args.decision === "approved",
      source: "approval_cascade",
      decidedByName: args.decidedByName,
    },
  });

  // Post a fresh check-run when we have everything we need. Each guard
  // failure here is intentional: GitHub App not installed, no head sha to
  // target, or no binding → record the decision but don't crash the
  // approval flow.
  if (!prior?.prHeadSha) return;
  const { isConfigured, postCheckRun } = await import("@/lib/integrations/github-app");
  if (!isConfigured()) return;

  const { adapterBindings } = await import("@/db/schema/adapter-binding");
  const binding = await db.query.adapterBindings.findFirst({
    where: and(
      eq(adapterBindings.organizationId, args.organizationId),
      eq(adapterBindings.provider, "github"),
      eq(adapterBindings.projectId, args.projectId),
    ),
  });
  const installationId =
    (binding?.config as { installationId?: string | number } | null)?.installationId;
  if (!installationId) return;

  try {
    const result = await postCheckRun({
      installationId: String(installationId),
      ownerRepo,
      headSha: prior.prHeadSha,
      name: "coznt / autonomy gate",
      conclusion: verdict,
      title: reason,
      summary: details.join("\n\n"),
    });
    if (result) {
      await db
        .update(gateEvaluations)
        .set({ checkRunId: String(result.id) })
        .where(eq(gateEvaluations.id, newEval.id));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(gateEvaluations)
      .set({ checkRunError: msg })
      .where(eq(gateEvaluations.id, newEval.id));
  }
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
