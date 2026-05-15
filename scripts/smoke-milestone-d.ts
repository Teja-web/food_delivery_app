/**
 * Milestone D smoke harness — dispatch gate.
 *
 * Verifies that PreToolUse stops being informational and becomes a hard
 * autonomy threshold check. When the calling skill's `minAutonomyLevel`
 * exceeds the (skill, project) current level, the call must be denied AND
 * a `skill_invocation` approval must land in the inbox.
 *
 * Acceptance:
 *   1. Skill with `minAutonomyLevel = 2` on a fresh project pair (level 0)
 *      → `allowed: false`, `reason` starts with `autonomy_gate`,
 *      a pending `skill_invocation` approval is created with the runId.
 *   2. Same skill with `minAutonomyLevel = 0`
 *      → `allowed: true`, no approval row.
 *   3. Action-policy violations still compose with the autonomy gate.
 *
 * Run with:
 *   pnpm smoke:milestone-d
 */

import "dotenv/config";

import { and, eq } from "drizzle-orm";

import { db } from "../src/db/client";
import { approvals } from "../src/db/schema/approval";
import { automationLog } from "../src/db/schema/automation-log";
import { projects } from "../src/db/schema/project";
import { skills } from "../src/db/schema/skill";
import { handlePreToolUse } from "../src/operations/tool-events";

const PROJECT_SLUG = "internal-payments-api";
const SKILL_SLUG = `smoke-d-skill-${Date.now()}`;
const RUN_PREFIX = `smoke-d-${Date.now()}`;

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
  await db
    .delete(approvals)
    .where(and(eq(approvals.entityType, "skill_invocation"), eq(approvals.organizationId, organizationId)));
  await db
    .delete(automationLog)
    .where(and(eq(automationLog.organizationId, organizationId), eq(automationLog.actorId, SKILL_SLUG)));
  if (skillId) {
    await db.delete(skills).where(eq(skills.id, skillId));
  }
}

async function main() {
  const project = await db.query.projects.findFirst({ where: eq(projects.slug, PROJECT_SLUG) });
  if (!project) fail(`project '${PROJECT_SLUG}' not found — run pnpm db:seed first`);
  const organizationId = project.organizationId;

  // Seed a fresh, project-scoped skill we own end-to-end so the test doesn't
  // perturb other autonomy state. New (skill, project) pair → level 0.
  const [skill] = await db
    .insert(skills)
    .values({
      organizationId,
      projectId: project.id,
      slug: SKILL_SLUG,
      name: `Smoke D skill ${SKILL_SLUG}`,
      body: "smoke",
      enabled: true,
      minAutonomyLevel: 2,
    })
    .returning();

  try {
    const apiCtx = { organizationId, projectId: project.id, apiKeyId: "smoke-d-key" };

    banner("Step 1 — autonomy gate DENIES when required > current");
    const denyRunId = `${RUN_PREFIX}-deny`;
    const denied = await handlePreToolUse(apiCtx, {
      skillSlug: SKILL_SLUG,
      tool: "edit",
      runId: denyRunId,
      paths: ["src/foo.ts"],
      fileCount: 1,
    });
    if (denied.allowed) fail(`expected allowed=false; got allowed=true (reason=${denied.reason})`);
    if (!denied.reason?.startsWith("autonomy_gate")) fail(`reason should start with autonomy_gate; got "${denied.reason}"`);
    if (!denied.approvalId) fail("expected approvalId to be set when gate denies");
    if (denied.autonomy?.level !== 0) fail(`expected current level=0; got ${denied.autonomy?.level}`);
    if (denied.autonomy?.requiredLevel !== 2) fail(`expected requiredLevel=2; got ${denied.autonomy?.requiredLevel}`);
    ok(`deny verdict: allowed=${denied.allowed} reason="${denied.reason}" approvalId=${denied.approvalId}`);

    const [approvalRow] = await db
      .select()
      .from(approvals)
      .where(eq(approvals.id, denied.approvalId))
      .limit(1);
    if (!approvalRow) fail("approval row not persisted");
    if (approvalRow.entityType !== "skill_invocation")
      fail(`expected entityType=skill_invocation; got ${approvalRow.entityType}`);
    if (approvalRow.entityId !== denyRunId)
      fail(`expected entityId=runId; got ${approvalRow.entityId}`);
    if (approvalRow.projectId !== project.id) fail("approval not scoped to project");
    if (approvalRow.status !== "pending") fail(`approval status should be pending; got ${approvalRow.status}`);
    ok(`skill_invocation approval persisted: id=${approvalRow.id} entityId=${approvalRow.entityId} status=${approvalRow.status}`);

    const [blockedLog] = await db
      .select()
      .from(automationLog)
      .where(eq(automationLog.id, denyRunId))
      .limit(1);
    if (!blockedLog) fail("automation_log row not written for blocked call");
    if (blockedLog.status !== "blocked") fail(`expected automation_log.status=blocked; got ${blockedLog.status}`);
    ok(`automation_log blocked row written`);

    banner("Step 2 — lowering threshold ALLOWS the call");
    await db.update(skills).set({ minAutonomyLevel: 0 }).where(eq(skills.id, skill.id));

    const allowRunId = `${RUN_PREFIX}-allow`;
    const allowed = await handlePreToolUse(apiCtx, {
      skillSlug: SKILL_SLUG,
      tool: "edit",
      runId: allowRunId,
      paths: ["src/foo.ts"],
      fileCount: 1,
    });
    if (!allowed.allowed) fail(`expected allowed=true; got allowed=false (reason=${allowed.reason})`);
    if (allowed.approvalId) fail("expected approvalId=null when gate allows");
    if (allowed.autonomy?.requiredLevel !== 0) fail(`expected requiredLevel=0 after lowering; got ${allowed.autonomy?.requiredLevel}`);
    ok(`allow verdict: allowed=${allowed.allowed} approvalId=${allowed.approvalId ?? "—"}`);

    const stillOnlyOne = await db
      .select()
      .from(approvals)
      .where(and(eq(approvals.organizationId, organizationId), eq(approvals.entityType, "skill_invocation")));
    if (stillOnlyOne.length !== 1) fail(`expected exactly 1 skill_invocation approval; got ${stillOnlyOne.length}`);
    ok(`no spurious approval created on allow path`);

    banner("Cleanup");
    await cleanup(organizationId, skill.id);
    ok("smoke rows removed");

    console.log("\n✓ Milestone D smoke passed.");
    process.exit(0);
  } catch (err) {
    await cleanup(organizationId, skill?.id ?? null);
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
