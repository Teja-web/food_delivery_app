/**
 * Demo trace — runs the full execution-gate loop end-to-end against the
 * seeded sample workspace. Prints what's happening at each step so a
 * human can see the autonomy ledger become physical.
 *
 *   1. Snapshot the starting state (skill autonomy, no gate evaluations)
 *   2. Open a synthetic PR by `frontend-test-author` on auth project
 *      (medium-risk: 120 lines, touches no critical paths)
 *   3. Evaluate the gate → expect `success` (Senior + medium)
 *   4. Record a critical incident outcome for that skill
 *   5. Recompute autonomy → expect demote to Intern
 *   6. Show the demote-triggered re-evaluation flipped the PR to failure
 *   7. Confirm countBlockedPrsForSkill reports the change
 *
 * Run with: pnpm tsx scripts/demo-execution-gate.ts
 */

import "dotenv/config";
import { and, desc, eq } from "drizzle-orm";

import { db } from "../src/db/client";
import { gateEvaluations } from "../src/db/schema/gate-evaluation";
import { projects } from "../src/db/schema/project";
import { skills } from "../src/db/schema/skill";
import { skillAutonomy } from "../src/db/schema/skill-autonomy";
import {
  countBlockedPrsForSkill,
  evaluatePullRequest,
} from "../src/operations/execution-gate";
import {
  getSkillAutonomy,
  recordSkillOutcome,
  recomputeSkillAutonomy,
} from "../src/operations/skill-autonomy";

// Use the payments project — it's in `development` phase, which is the only
// phase that allows code changes per the discipline model. The demo flexes
// the autonomy×risk leg of the policy, not the phase-mismatch leg.
const SKILL_SLUG = "frontend-test-author";
const PROJECT_SLUG = "internal-payments-api";
const PR_REF = "github:northwind/payments-api#9001";

function banner(label: string) {
  console.log(`\n${"═".repeat(72)}\n  ${label}\n${"═".repeat(72)}`);
}

function row(...cells: unknown[]) {
  console.log("  " + cells.map((c) => String(c)).join("  ·  "));
}

async function main() {
  // ── 0. Lookup seeded skill + project ────────────────────────────────
  const [skill] = await db.select().from(skills).where(eq(skills.slug, SKILL_SLUG)).limit(1);
  const [project] = await db.select().from(projects).where(eq(projects.slug, PROJECT_SLUG)).limit(1);
  if (!skill || !project) {
    console.error(`Seeded skill/project missing. Did you run pnpm db:onboard --sample?`);
    process.exit(2);
  }
  const orgId = skill.organizationId;

  banner("Step 0 — Pre-seed per-project autonomy so the trace is deterministic");
  // The seed patch may or may not have populated the per-project autonomy row
  // depending on when the user last re-onboarded. Force it to senior(2) so the
  // arc is the same on every run.
  await db
    .insert(skillAutonomy)
    .values({
      skillId: skill.id,
      projectId: project.id,
      organizationId: skill.organizationId,
      level: 2,
      levelSetAt: new Date(Date.now() - 30 * 86_400_000),
      lastReviewedAt: new Date(Date.now() - 7 * 86_400_000),
      nextReviewAt: new Date(Date.now() + 14 * 86_400_000),
      lastReason: "Held at Senior — clean run on payments suite (set by demo)",
    })
    .onConflictDoUpdate({
      target: [skillAutonomy.skillId, skillAutonomy.projectId],
      set: {
        level: 2,
        levelSetAt: new Date(Date.now() - 30 * 86_400_000),
        lastReviewedAt: new Date(Date.now() - 7 * 86_400_000),
        lastReason: "Held at Senior — clean run on payments suite (set by demo)",
      },
    });
  row("Upserted per-project autonomy: skill=", skill.slug, "project=", project.slug, "level=2 (senior)");

  banner("Step 1 — Starting state");
  const start = await getSkillAutonomy(skill.id, project.id);
  const startOrgWide = await getSkillAutonomy(skill.id, null);
  row("Skill:", skill.slug, "→", skill.name);
  row("Project:", project.slug, "phase=", project.phase);
  row("Per-project autonomy:", `level=${start.level} (${start.levelName})`, "—", start.lastReason);
  row("Org-wide autonomy (fallback):", `level=${startOrgWide.level} (${startOrgWide.levelName})`);
  const startEvals = await db
    .select()
    .from(gateEvaluations)
    .where(and(eq(gateEvaluations.projectId, project.id), eq(gateEvaluations.prRef, PR_REF)));
  row("Existing gate evaluations for this PR:", startEvals.length);

  // ── 2. Open a synthetic PR — evaluate the gate ──────────────────────
  banner("Step 2 — Simulate a PR opening (120 lines, no critical-path hits)");
  const initialLevel = start.level > 0 ? start.level : startOrgWide.level;
  row("Composing gate input — skillLevel=", initialLevel, "changeRisk= medium");
  const firstVerdict = await evaluatePullRequest({
    organizationId: orgId,
    projectId: project.id,
    prRef: PR_REF,
    prTitle: "Add E2E coverage for session-cookie path",
    prHeadSha: "deadbeefcafe1234567890abcdef1234567890ab",
    skillId: skill.id,
    skillLevel: initialLevel,
    changeRisk: "medium",
    ruleViolations: [],
    phase: project.phase,
    hasHumanApproval: false,
  });
  row("Verdict:", firstVerdict.verdict.verdict.toUpperCase(), "—", firstVerdict.verdict.reason);
  for (const d of firstVerdict.verdict.details) row("  detail:", d);

  // ── 3. Record a critical incident, recompute autonomy ───────────────
  banner("Step 3 — Skill ships an incident; record outcome + recompute");
  await recordSkillOutcome({
    skillId: skill.id,
    projectId: project.id,
    organizationId: orgId,
    verdict: "incident",
    severity: "critical",
  });
  row("Recorded outcome: verdict=incident severity=critical");
  const result = await recomputeSkillAutonomy(skill.id, project.id);
  row("Recompute result:", `level=${result.level} (${result.levelName})`, "promoted=", result.promoted, "demoted=", result.demoted);
  row("Reason:", result.reason);

  // ── 4. Demote should have triggered re-eval. Inspect ────────────────
  banner("Step 4 — Demote hook fired re-evaluation");
  const allEvals = await db
    .select()
    .from(gateEvaluations)
    .where(and(eq(gateEvaluations.projectId, project.id), eq(gateEvaluations.prRef, PR_REF)))
    .orderBy(desc(gateEvaluations.evaluatedAt));
  row("gate_evaluations rows for this PR:", allEvals.length);
  for (const e of allEvals) {
    row("  ", e.evaluatedAt.toISOString().slice(11, 19), "·", e.verdict.toUpperCase(), "·", e.reason);
  }

  // ── 5. Blocked-PR count ─────────────────────────────────────────────
  banner("Step 5 — countBlockedPrsForSkill (powers /skills/[id] banner)");
  const blockedPerProject = await countBlockedPrsForSkill(orgId, skill.id, project.id);
  const blockedOrgWide = await countBlockedPrsForSkill(orgId, skill.id, null);
  row("Blocked PRs (this project):", blockedPerProject);
  row("Blocked PRs (org-wide):", blockedOrgWide);

  // ── 6. Cleanup so re-running stays idempotent ───────────────────────
  banner("Step 6 — Cleanup");
  await db.delete(gateEvaluations).where(eq(gateEvaluations.prRef, PR_REF));
  // Reset the autonomy row to its seeded state so successive runs show the
  // same demote arc. We re-upsert the per-project row to senior(2).
  await db
    .insert(skillAutonomy)
    .values({
      skillId: skill.id,
      projectId: project.id,
      organizationId: orgId,
      level: 2,
      levelSetAt: new Date(),
      lastReviewedAt: new Date(),
      nextReviewAt: new Date(Date.now() + 14 * 86_400_000),
      lastReason: "Reset by demo script for idempotent re-run",
    })
    .onConflictDoUpdate({
      target: [skillAutonomy.skillId, skillAutonomy.projectId],
      set: {
        level: 2,
        lastReason: "Reset by demo script for idempotent re-run",
        levelSetAt: new Date(),
      },
    });
  row("Cleaned up gate_evaluations rows for", PR_REF);
  row("Reset skill_autonomy to level=2 for next run");

  console.log("\nDone.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nDemo failed:", err);
  process.exit(1);
});
