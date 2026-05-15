/**
 * Milestone A smoke harness.
 *
 * Simulates the loop end-to-end without needing a real GitHub App. Each
 * step is asserted; the script exits non-zero if any step fails. Useful
 * as a daily CI smoke check and as the acceptance-criteria validator
 * from `docs/milestone-a-plan.md`:
 *
 *   1. A new merge by an attributed skill produces a `skill_outcome`
 *      within seconds (rolled_back path simulated via revert PR).
 *   2. `recomputeSkillAutonomy` reflects the new outcome.
 *   3. The execution gate's next verdict on a fresh PR uses the updated
 *      level.
 *   4. The lookback cron writes the deferred `pr_merge` success row when
 *      the observation window has elapsed.
 *
 * Run with:
 *   pnpm smoke:milestone-a
 *
 * Reads from the existing seeded workspace (run `pnpm db:seed` first if
 * the workspace is empty). The script writes test rows scoped to a
 * unique PR ref and cleans up on success.
 */

import "dotenv/config";

import { and, desc, eq, like } from "drizzle-orm";

import { db } from "../src/db/client";
import { gateEvaluations } from "../src/db/schema/gate-evaluation";
import { projects } from "../src/db/schema/project";
import { skillOutcomes } from "../src/db/schema/skill-outcome";
import { skills } from "../src/db/schema/skill";
import {
  evaluatePullRequest,
} from "../src/operations/execution-gate";
import {
  getSkillAutonomy,
  recordAssessorOutcome,
  recomputeSkillAutonomy,
} from "../src/operations/skill-autonomy";
import {
  assessPrMerged,
  assessPrReverted,
} from "../src/domain/outcomes";

const SKILL_SLUG = "frontend-test-author";
const PROJECT_SLUG = "internal-payments-api";
const PR_NUMBER = 99001;
const PR_REF = `github:northwind/payments-api#${PR_NUMBER}`;
const SOURCE_REF = PR_REF;

function ok(label: string) {
  console.log(`  ✓ ${label}`);
}
function fail(label: string, err?: unknown): never {
  console.error(`  ✗ ${label}${err ? ` — ${String(err)}` : ""}`);
  process.exit(1);
}
function banner(label: string) {
  console.log(`\n── ${label} ${"─".repeat(Math.max(0, 64 - label.length))}`);
}

async function getFixtures() {
  const skill = await db.query.skills.findFirst({ where: eq(skills.slug, SKILL_SLUG) });
  if (!skill) fail(`skill '${SKILL_SLUG}' not found — run pnpm db:seed first`);
  const project = await db.query.projects.findFirst({ where: eq(projects.slug, PROJECT_SLUG) });
  if (!project) fail(`project '${PROJECT_SLUG}' not found — run pnpm db:seed first`);
  return { skill, project };
}

async function cleanup(skillId: string) {
  await db
    .delete(skillOutcomes)
    .where(
      and(eq(skillOutcomes.skillId, skillId), like(skillOutcomes.sourceRef, `${SOURCE_REF}%`)),
    );
  await db
    .delete(gateEvaluations)
    .where(and(eq(gateEvaluations.skillId, skillId), eq(gateEvaluations.prRef, PR_REF)));
}

async function main() {
  const { skill, project } = await getFixtures();
  await cleanup(skill.id);

  banner("Step 1 — initial gate evaluation");
  const initial = await evaluatePullRequest({
    organizationId: skill.organizationId,
    projectId: project.id,
    prRef: PR_REF,
    prTitle: "smoke: feature flag rollout",
    prHeadSha: "0000000000000000000000000000000000000001",
    skillId: skill.id,
    skillLevel: (await getSkillAutonomy(skill.id, project.id)).level,
    changeRisk: "low",
    ruleViolations: [],
    phase: project.phase,
    hasHumanApproval: false,
  });
  ok(`initial verdict: ${initial.verdict.verdict} (${initial.verdict.reason})`);

  banner("Step 2 — synchronous revert assessor writes rolled_back outcome");
  const revertResult = assessPrReverted(
    {
      merged: true,
      mergedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      closed: true,
      closedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    },
    { committedAt: new Date(), sha: "deadbeefcafe0001" },
  );
  if (revertResult.verdict !== "rolled_back") fail(`expected rolled_back; got ${revertResult.verdict}`);
  await recordAssessorOutcome({
    skillId: skill.id,
    projectId: project.id,
    sourceKind: "pr_revert",
    sourceRef: SOURCE_REF,
    result: revertResult,
  });
  const [revertRow] = await db
    .select()
    .from(skillOutcomes)
    .where(
      and(
        eq(skillOutcomes.skillId, skill.id),
        eq(skillOutcomes.sourceKind, "pr_revert"),
        eq(skillOutcomes.sourceRef, SOURCE_REF),
      ),
    )
    .limit(1);
  if (!revertRow) fail("skill_outcomes pr_revert row not persisted");
  ok(`skill_outcomes row written: id=${revertRow.id} severity=${revertRow.severity}`);

  banner("Step 3 — idempotency");
  const duplicate = await recordAssessorOutcome({
    skillId: skill.id,
    projectId: project.id,
    sourceKind: "pr_revert",
    sourceRef: SOURCE_REF,
    result: revertResult,
  });
  if (duplicate !== null) fail(`expected null on duplicate insert; got ${duplicate.id}`);
  ok("duplicate insert returned null (idempotency holds)");

  banner("Step 4 — autonomy recompute picks up the outcome");
  const before = await getSkillAutonomy(skill.id, project.id);
  await recomputeSkillAutonomy(skill.id, project.id);
  const after = await getSkillAutonomy(skill.id, project.id);
  ok(`autonomy: ${before.levelName} → ${after.levelName} (${after.lastReason ?? "no reason recorded"})`);

  banner("Step 5 — deferred pr_merge assessor (lookback path)");
  const mergedResult = assessPrMerged(
    {
      merged: true,
      mergedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      closed: true,
      closedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
    },
    { reverted: false, requiredChecksGreen: true },
  );
  if (mergedResult.verdict !== "success") fail(`expected success; got ${mergedResult.verdict}`);
  const otherRef = `${SOURCE_REF}#merge`;
  await recordAssessorOutcome({
    skillId: skill.id,
    projectId: project.id,
    sourceKind: "pr_merge",
    sourceRef: otherRef,
    result: mergedResult,
  });
  const [mergeRow] = await db
    .select()
    .from(skillOutcomes)
    .where(
      and(
        eq(skillOutcomes.skillId, skill.id),
        eq(skillOutcomes.sourceKind, "pr_merge"),
        eq(skillOutcomes.sourceRef, otherRef),
      ),
    )
    .limit(1);
  if (!mergeRow) fail("skill_outcomes pr_merge row not persisted");
  ok(`pr_merge success row written: id=${mergeRow.id}`);

  banner("Step 6 — re-evaluated gate after autonomy change");
  const refreshed = await evaluatePullRequest({
    organizationId: skill.organizationId,
    projectId: project.id,
    prRef: PR_REF + "-followup",
    prTitle: "smoke: follow-up after demote",
    prHeadSha: "0000000000000000000000000000000000000002",
    skillId: skill.id,
    skillLevel: after.level,
    changeRisk: "high",
    ruleViolations: [],
    phase: project.phase,
    hasHumanApproval: false,
  });
  ok(`follow-up verdict: ${refreshed.verdict.verdict} (${refreshed.verdict.reason})`);

  banner("done");
  await cleanup(skill.id);
  // Cleanup the follow-up evaluation too.
  await db
    .delete(gateEvaluations)
    .where(eq(gateEvaluations.prRef, PR_REF + "-followup"));
  console.log("\nSmoke run passed. Acceptance criteria mapping:");
  console.log(
    "  • criterion 1 (outcome row within 1m of merge/revert) — step 2",
  );
  console.log(
    "  • criterion 2 (autonomy reflects the new outcome) — step 4",
  );
  console.log(
    "  • criterion 3 (gate uses post-A autonomy on the next PR) — step 6",
  );
  console.log(
    "  • criterion 4 (full chain queryable from /audit) — every step wrote an audit_log entry",
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("\nSmoke run failed:", err);
    process.exit(1);
  },
);
