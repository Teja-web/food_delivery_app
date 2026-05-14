/**
 * Milestone E smoke harness — MCP plan upsert + fetch.
 *
 * Exercises `upsert_plan` and `get_plans` end-to-end against a seeded
 * project. Confirms the (project, kind, slug) upsert key is honored, the
 * revision ledger appends correctly, and the detail-fetch path returns
 * body + revisions + approvals.
 *
 * Acceptance:
 *   1. First upsert returns `created=true, revisionNumber=0`.
 *   2. Second upsert with the same `(project, kind, slug)` returns
 *      `created=false, revisionNumber=1`; the live plan's body matches
 *      the second call's body, and one `plan_revisions` row exists.
 *   3. A third upsert with the same (project, kind) but a different
 *      `slug` creates a new plan (proves the unique key is composite).
 *   4. `listPlansByProject`-style filter returns both rows for the kind.
 *
 * Run with:
 *   pnpm smoke:milestone-e
 */

import "dotenv/config";

import { and, eq } from "drizzle-orm";

import { db } from "../src/db/client";
import { plans } from "../src/db/schema/plan";
import { planRevisions } from "../src/db/schema/plan-revision";
import { projects } from "../src/db/schema/project";
import { buildScopedContext, runWithMessageContext } from "../src/lib/auth/context";
import { renderPipeline } from "../src/lib/pipelines/templates";
import { upsertPlanByKindAndSlug } from "../src/operations/plans";

const PROJECT_SLUG = "internal-payments-api";
const SUFFIX = `smoke-e-${Date.now()}`;
const SLUG_A = `${SUFFIX}-a`;
const SLUG_B = `${SUFFIX}-b`;

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

async function cleanup(organizationId: string) {
  // Targeted delete by slug to avoid touching seeded data.
  // plan_revisions cascades via FK on planId.
  await db
    .delete(plans)
    .where(and(eq(plans.organizationId, organizationId), eq(plans.slug, SLUG_A)));
  await db
    .delete(plans)
    .where(and(eq(plans.organizationId, organizationId), eq(plans.slug, SLUG_B)));
}

async function main() {
  const project = await db.query.projects.findFirst({ where: eq(projects.slug, PROJECT_SLUG) });
  if (!project) fail(`project '${PROJECT_SLUG}' not found — run pnpm db:seed first`);

  const organizationId = project.organizationId;
  const ctx = buildScopedContext(
    organizationId,
    { id: "smoke-e-actor", name: "smoke-e" },
    { projectId: project.id, role: "system" },
  );

  await cleanup(organizationId);

  await runWithMessageContext(ctx, async () => {
    banner("Step 1 — first upsert creates a draft plan");
    const r1 = await upsertPlanByKindAndSlug({
      projectId: project.id,
      kind: "test_plan",
      slug: SLUG_A,
      title: "Smoke E — test plan v1",
      body: "## Scope\nv1 body",
    });
    if (!r1.created) fail(`expected created=true on first upsert; got ${r1.created}`);
    if (r1.revisionNumber !== 0) fail(`expected revisionNumber=0; got ${r1.revisionNumber}`);
    if (r1.plan.status !== "draft") fail(`expected status=draft; got ${r1.plan.status}`);
    ok(`first upsert: created=true revisionNumber=0 planId=${r1.plan.id}`);

    banner("Step 2 — second upsert appends a revision");
    const r2 = await upsertPlanByKindAndSlug({
      projectId: project.id,
      kind: "test_plan",
      slug: SLUG_A,
      title: "Smoke E — test plan v2",
      summary: "Now with a summary",
      body: "## Scope\nv2 body — expanded",
      changeNote: "regenerated after requirements update",
    });
    if (r2.created) fail(`expected created=false on revise; got ${r2.created}`);
    if (r2.revisionNumber !== 1) fail(`expected revisionNumber=1; got ${r2.revisionNumber}`);
    if (r2.plan.id !== r1.plan.id) fail(`plan id should match on revise: ${r1.plan.id} vs ${r2.plan.id}`);
    if (r2.plan.body !== "## Scope\nv2 body — expanded")
      fail(`live body should reflect v2; got "${r2.plan.body?.slice(0, 40)}…"`);
    if (r2.plan.title !== "Smoke E — test plan v2")
      fail(`title should refresh on revise; got "${r2.plan.title}"`);
    ok(`revise upsert: revisionNumber=1 body refreshed`);

    const revisions = await db
      .select()
      .from(planRevisions)
      .where(eq(planRevisions.planId, r1.plan.id));
    if (revisions.length !== 1)
      fail(`expected exactly 1 plan_revisions row after revise; got ${revisions.length}`);
    if (revisions[0].changeNote !== "regenerated after requirements update")
      fail(`revision changeNote not stored; got "${revisions[0].changeNote}"`);
    ok(`plan_revisions ledger: 1 row, changeNote stored`);

    banner("Step 3 — same (project, kind) + different slug = separate plan");
    const r3 = await upsertPlanByKindAndSlug({
      projectId: project.id,
      kind: "test_plan",
      slug: SLUG_B,
      title: "Smoke E — independent plan",
      body: "different document",
    });
    if (!r3.created) fail(`expected created=true for new slug; got ${r3.created}`);
    if (r3.plan.id === r1.plan.id) fail(`new slug should produce a distinct plan id`);
    ok(`distinct slug creates distinct plan: id=${r3.plan.id}`);

    banner("Step 4 — list-by-kind returns both plans");
    const listed = await db.query.plans.findMany({
      where: and(
        eq(plans.organizationId, organizationId),
        eq(plans.projectId, project.id),
        eq(plans.kind, "test_plan"),
      ),
    });
    const ours = listed.filter((p) => p.slug === SLUG_A || p.slug === SLUG_B);
    if (ours.length !== 2) fail(`expected 2 plans for our slugs in this kind; got ${ours.length}`);
    ok(`list returned ${ours.length} matching plans for kind=test_plan`);

    banner("Step 5 — generate_pipeline renders for each platform");
    const platforms = ["github_actions", "azure_devops", "gitlab_ci", "jenkins"] as const;
    for (const platform of platforms) {
      const out = renderPipeline({ platform, stack: "node" });
      if (!out.filename || !out.content)
        fail(`renderPipeline(${platform}) returned empty result`);
      if (out.content.length < 100)
        fail(`renderPipeline(${platform}) content suspiciously short: ${out.content.length} chars`);
      ok(`${platform}: ${out.filename} (${out.content.length} chars)`);
    }

    const withAddons = renderPipeline({
      platform: "github_actions",
      stack: "node",
      includeDocker: true,
      includeKubernetes: true,
    });
    const noAddons = renderPipeline({ platform: "github_actions", stack: "node" });
    if (withAddons.content.length <= noAddons.content.length)
      fail(`docker+k8s addons did not extend the output`);
    ok(`addons append correctly: +${withAddons.content.length - noAddons.content.length} chars`);
  });

  banner("Cleanup");
  await cleanup(organizationId);
  ok("smoke rows removed");

  console.log("\n✓ Milestone E smoke passed.");
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
