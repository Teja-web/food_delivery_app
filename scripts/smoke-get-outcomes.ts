/**
 * Smoke harness for the `get_outcomes` MCP verb / `/api/v1/mcp/outcomes`.
 *
 * Verifies the agent-facing read works: outcomes are scoped to the API
 * context, skillSlug filters narrow the result, the limit cap is honored,
 * and a project-scoped API key cannot peek at a sibling project.
 *
 * Run with:
 *   pnpm smoke:get-outcomes
 */

import "dotenv/config";

import { and, eq, like } from "drizzle-orm";

import { db } from "../src/db/client";
import { projects } from "../src/db/schema/project";
import { skillOutcomes } from "../src/db/schema/skill-outcome";
import { skills } from "../src/db/schema/skill";
import type { ApiContext } from "../src/lib/api/auth";
import { recordSkillOutcome } from "../src/operations/skill-autonomy";
import { listOutcomesForAgent } from "../src/app/api/v1/mcp/outcomes/route";

const PROJECT_SLUG = "internal-payments-api";
const SKILL_SLUG_A = `smoke-out-a-${Date.now()}`;
const SKILL_SLUG_B = `smoke-out-b-${Date.now()}`;
const INVOCATION_PREFIX = `smoke-out-${Date.now()}`;

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

async function cleanup(organizationId: string, skillIds: string[]) {
  if (skillIds.length === 0) return;
  await db
    .delete(skillOutcomes)
    .where(
      and(
        eq(skillOutcomes.organizationId, organizationId),
        like(skillOutcomes.invocationId, `${INVOCATION_PREFIX}%`),
      ),
    );
  for (const id of skillIds) {
    await db.delete(skills).where(eq(skills.id, id));
  }
}

async function main() {
  const project = await db.query.projects.findFirst({ where: eq(projects.slug, PROJECT_SLUG) });
  if (!project) fail(`project '${PROJECT_SLUG}' not found — run pnpm db:seed first`);
  const organizationId = project.organizationId;

  // Seed two fresh skills so we can test the slug filter without colliding
  // with autonomy state on any existing seeded skill.
  const inserted = await db
    .insert(skills)
    .values([
      {
        organizationId,
        projectId: project.id,
        slug: SKILL_SLUG_A,
        name: `Smoke outcomes skill A`,
        body: "smoke",
        enabled: true,
      },
      {
        organizationId,
        projectId: project.id,
        slug: SKILL_SLUG_B,
        name: `Smoke outcomes skill B`,
        body: "smoke",
        enabled: true,
      },
    ])
    .returning({ id: skills.id, slug: skills.slug });
  const skillA = inserted.find((s) => s.slug === SKILL_SLUG_A)!;
  const skillB = inserted.find((s) => s.slug === SKILL_SLUG_B)!;

  try {
    // Two outcomes for A, one for B — gives us enough to assert filtering + ordering.
    await recordSkillOutcome({
      skillId: skillA.id,
      projectId: project.id,
      invocationId: `${INVOCATION_PREFIX}-a1`,
      verdict: "success",
    });
    await recordSkillOutcome({
      skillId: skillA.id,
      projectId: project.id,
      invocationId: `${INVOCATION_PREFIX}-a2`,
      verdict: "incident",
      severity: "high",
    });
    await recordSkillOutcome({
      skillId: skillB.id,
      projectId: project.id,
      invocationId: `${INVOCATION_PREFIX}-b1`,
      verdict: "success",
    });

    const orgCtx: ApiContext = {
      organizationId,
      projectId: null,
      apiKeyId: "smoke-out-org-key",
    };
    const projectCtx: ApiContext = {
      organizationId,
      projectId: project.id,
      apiKeyId: "smoke-out-proj-key",
    };

    banner("Step 1 — skillSlug filter returns only that skill's outcomes");
    const filteredA = await listOutcomesForAgent(orgCtx, {
      projectId: project.id,
      skillSlug: SKILL_SLUG_A,
    });
    if (filteredA.outcomes.length !== 2)
      fail(`expected 2 rows for skill A; got ${filteredA.outcomes.length}`);
    if (!filteredA.outcomes.every((o) => o.skillSlug === SKILL_SLUG_A))
      fail(`row(s) leaked from a different skill`);
    if (filteredA.outcomes[0].recordedAt < filteredA.outcomes[1].recordedAt)
      fail(`outcomes should be desc by recordedAt`);
    ok(`2 rows, all skillSlug=${SKILL_SLUG_A}, desc by recordedAt`);

    banner("Step 2 — no skillSlug returns all project outcomes");
    const allOnProject = await listOutcomesForAgent(orgCtx, { projectId: project.id });
    const ours = allOnProject.outcomes.filter(
      (o) => o.skillSlug === SKILL_SLUG_A || o.skillSlug === SKILL_SLUG_B,
    );
    if (ours.length !== 3) fail(`expected 3 of our outcomes; got ${ours.length}`);
    ok(`3 outcomes across our 2 skills returned`);

    banner("Step 3 — project-scoped key denies cross-project queries");
    let raised: { status?: number } | null = null;
    try {
      await listOutcomesForAgent(projectCtx, { projectId: "some-other-project-id" });
    } catch (e) {
      raised = e as { status?: number };
    }
    if (!raised) fail(`expected an error; got success`);
    if (raised.status !== 403) fail(`expected status=403; got ${raised.status}`);
    ok(`cross-project denied with status=403`);

    banner("Step 4 — limit cap is honored");
    const capped = await listOutcomesForAgent(orgCtx, {
      projectId: project.id,
      limit: 1,
    });
    if (capped.outcomes.length !== 1) fail(`expected 1 row; got ${capped.outcomes.length}`);
    if (capped.filters.limit !== 1) fail(`expected echoed limit=1; got ${capped.filters.limit}`);
    ok(`limit=1 returned exactly 1 row`);

    banner("Step 5 — unknown skill slug 404s cleanly");
    raised = null;
    try {
      await listOutcomesForAgent(orgCtx, { skillSlug: "definitely-not-a-skill" });
    } catch (e) {
      raised = e as { status?: number };
    }
    if (!raised || raised.status !== 404)
      fail(`expected 404 for unknown slug; got status=${raised?.status ?? "no error"}`);
    ok(`unknown slug → 404`);

    banner("Cleanup");
    await cleanup(organizationId, [skillA.id, skillB.id]);
    ok("smoke rows removed");

    console.log("\n✓ get_outcomes smoke passed.");
    process.exit(0);
  } catch (err) {
    await cleanup(organizationId, [skillA.id, skillB.id]);
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
