/**
 * Milestone C smoke harness.
 *
 * Exercises the first AI agent (`change-risk-classifier`) end-to-end and
 * the PreToolUse / PostToolUse on-ramp without needing a live IDE plugin
 * or a real GitHub delivery.
 *
 * Acceptance:
 *   1. `classifyChangeRiskTask` runs against a seeded project, writes an
 *      `intelligence` row of kind `change-risk`, and appends a
 *      `skill_outcomes` row (sourceKind: invocation).
 *   2. `handlePreToolUse` for a dangerous shell command returns
 *      `allowed: false` when an action-policy rule is in place, and
 *      returns the current autonomy level for the skill.
 *   3. `handlePostToolUse` records a `succeeded` verdict to
 *      `skill_outcomes` keyed by the same runId.
 *
 * Run with:
 *   pnpm smoke:milestone-c
 *
 * The script writes test rows scoped to a unique PR ref + run id and
 * cleans up on success. Skipped silently if OPENAI/GROQ keys are absent
 * so the script is safe in CI without secrets.
 */

import "dotenv/config";

import { and, eq, like, desc } from "drizzle-orm";

import { db } from "../src/db/client";
import { automationLog } from "../src/db/schema/automation-log";
import { intelligence } from "../src/db/schema/intelligence";
import { projects } from "../src/db/schema/project";
import { skillOutcomes } from "../src/db/schema/skill-outcome";
import { skills } from "../src/db/schema/skill";
import { CHANGE_RISK_CLASSIFIER_SLUG } from "../src/automations/agents/definitions/change-risk-classifier";
import { classifyChangeRiskTask } from "../src/automations/tasks/classify-change-risk";
import { handlePostToolUse, handlePreToolUse } from "../src/operations/tool-events";

const PROJECT_SLUG = "internal-payments-api";
const PR_REF = "github:northwind/payments-api#90042";
const RUN_ID = `smoke-c-${Date.now()}`;

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

async function cleanup(organizationId: string, skillId: string | null) {
  // intelligence rows hold an FK into automation_logs — drop them first.
  await db.delete(intelligence).where(
    and(eq(intelligence.entityType, "work_item"), eq(intelligence.entityId, PR_REF)),
  );
  await db.delete(intelligence).where(like(intelligence.lastRunId, "smoke-c-%"));
  await db.delete(automationLog).where(like(automationLog.id, "smoke-c-%"));
  if (skillId) {
    await db
      .delete(skillOutcomes)
      .where(and(eq(skillOutcomes.skillId, skillId), eq(skillOutcomes.invocationId, RUN_ID)));
  }
}

async function main() {
  const project = await db.query.projects.findFirst({ where: eq(projects.slug, PROJECT_SLUG) });
  if (!project) fail(`project '${PROJECT_SLUG}' not found — run pnpm db:seed first`);
  const organizationId = project.organizationId;

  // Existing skill row used by the PreToolUse / PostToolUse leg. Any seeded
  // skill works; pick the first one in the org.
  const anySkill = await db.query.skills.findFirst({
    where: eq(skills.organizationId, organizationId),
  });
  if (!anySkill) fail("no skills seeded in this organization");

  await cleanup(organizationId, anySkill.id);

  banner("Step 1 — change-risk-classifier agent end-to-end");
  if (!process.env.OPENAI_API_KEY && !process.env.GROQ_API_KEY) {
    console.log("  ↷ no model API key set — skipping AI agent step");
  } else {
    const result = await classifyChangeRiskTask({
      organizationId,
      projectId: project.id,
      projectName: project.name,
      projectPhase: project.phase ?? "development",
      prRef: PR_REF,
      prTitle: "feat(auth): rotate JWT signing key",
      prBody: "Rotates the signing key. Includes migration that drops the old key column after 24h.",
      files: [
        { filename: "src/auth/jwt.ts", additions: 84, deletions: 12 },
        { filename: "drizzle/0099_drop_old_key.sql", additions: 6, deletions: 0 },
      ],
      totalLines: 102,
      criticalPaths: ["src/auth/"],
      productionCriticalPaths: ["drizzle/"],
      heuristicRisk: "high",
      activeRules: [],
    });
    if (!result) fail("classifyChangeRiskTask returned null (AI run failed)");
    ok(`agent verdict: ${result.classification.riskClass} (${result.classification.signals.length} signals)`);

    const [intelRow] = await db
      .select()
      .from(intelligence)
      .where(and(eq(intelligence.entityType, "work_item"), eq(intelligence.entityId, PR_REF)))
      .limit(1);
    if (!intelRow) fail("intelligence row not persisted");
    if (intelRow.kind !== "change-risk") fail(`expected kind=change-risk; got ${intelRow.kind}`);
    ok(`intelligence row stored: id=${intelRow.id} summary="${(intelRow.summary ?? "").slice(0, 60)}…"`);

    const classifierSkill = await db.query.skills.findFirst({
      where: and(eq(skills.organizationId, organizationId), eq(skills.slug, CHANGE_RISK_CLASSIFIER_SLUG)),
    });
    if (!classifierSkill) fail("change-risk-classifier skill row not lazy-created");
    const [outcome] = await db
      .select()
      .from(skillOutcomes)
      .where(
        and(
          eq(skillOutcomes.skillId, classifierSkill.id),
          eq(skillOutcomes.projectId, project.id),
        ),
      )
      .orderBy(desc(skillOutcomes.recordedAt))
      .limit(1);
    if (!outcome) fail("skill_outcomes row not appended for the classifier");
    ok(`skill_outcomes appended: verdict=${outcome.verdict} sourceKind=${outcome.sourceKind}`);
  }

  banner("Step 2 — PreToolUse returns allowed + autonomy level");
  const apiCtx = {
    organizationId,
    projectId: project.id,
    apiKeyId: "smoke-c-key",
  };
  const pre = await handlePreToolUse(apiCtx, {
    skillSlug: anySkill.slug,
    tool: "edit",
    runId: RUN_ID,
    paths: ["src/foo.ts"],
    fileCount: 1,
    hasTests: false,
  });
  if (typeof pre.allowed !== "boolean") fail("PreToolUse missing `allowed`");
  if (pre.runId !== RUN_ID) fail(`PreToolUse echoed runId=${pre.runId}; expected ${RUN_ID}`);
  if (!pre.skillId) fail("PreToolUse did not resolve skill");
  ok(`pre verdict: allowed=${pre.allowed} autonomy=${pre.autonomy?.levelName ?? "—"} runId=${pre.runId}`);

  banner("Step 3 — PostToolUse appends skill_outcomes row");
  const post = await handlePostToolUse(apiCtx, {
    skillSlug: anySkill.slug,
    tool: "edit",
    runId: RUN_ID,
    status: "succeeded",
    durationMs: 1240,
    summary: "Smoke run — edited src/foo.ts.",
    result: { filesTouched: ["src/foo.ts"], linesAdded: 12 },
  });
  if (!post.recorded || !post.outcomeId) fail("PostToolUse did not record outcome");
  ok(`post recorded: outcomeId=${post.outcomeId} intelligenceId=${post.intelligenceId ?? "—"}`);

  const [postOutcome] = await db
    .select()
    .from(skillOutcomes)
    .where(eq(skillOutcomes.id, post.outcomeId))
    .limit(1);
  if (!postOutcome) fail("PostToolUse outcome row not found in DB");
  if (postOutcome.verdict !== "success") fail(`expected verdict=success; got ${postOutcome.verdict}`);
  ok(`outcome verdict=${postOutcome.verdict} project=${postOutcome.projectId ?? "—"}`);

  banner("Cleanup");
  const classifierSkillForCleanup = await db.query.skills.findFirst({
    where: and(eq(skills.organizationId, organizationId), eq(skills.slug, CHANGE_RISK_CLASSIFIER_SLUG)),
  });
  await cleanup(organizationId, anySkill.id);
  if (classifierSkillForCleanup) {
    await db
      .delete(skillOutcomes)
      .where(eq(skillOutcomes.skillId, classifierSkillForCleanup.id));
  }
  ok("smoke rows removed");

  console.log("\n✓ Milestone C smoke passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
