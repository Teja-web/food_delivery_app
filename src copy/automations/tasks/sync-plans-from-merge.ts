/**
 * Sync `.agents/plans/<kind>/*.md` and well-known plan paths into the
 * `project_tasks` table on default-branch push, per
 * docs/spec/dev-authoring-surface.md §10 / §12 / §7.1.
 *
 * Path resolution (in precedence order):
 *   1. .agents/plans/<kind>/*.md         — kind inferred from directory
 *   2. Well-known convention paths       — scanned only if frontmatter `kind:` set
 *      docs/adr/, docs/adrs/, docs/architecture-decisions/, docs/specs/,
 *      docs/test-plans/
 *   3. Custom paths declared in .agents/coznt.yaml (resolveAuthoringPaths)
 *
 * Routing per §12:
 *   Added / Modified project-task → direct DB write + audit. Status
 *     transitions happen separately, via the PR lifecycle handler.
 *   Removed project-task          → soft-delete (status=cancelled) + audit
 *
 * `plan_relationships` rows are upserted from frontmatter `relationships`
 * (and shorthand `parent` / `supersedes` / `derivedFrom` / `relatesTo`).
 * Targets reference other plans by slug; we resolve them at apply time and
 * skip+report rows whose target doesn't exist yet (devs may land them in
 * the same PR; the second apply pass would catch them, but MVP doesn't
 * batch — see "Open questions §21").
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { projectTasks, type ProjectTask } from "@/db/schema/plan/project-task";
import { planRelationships } from "@/db/schema/plan/plan-relationship";
import {
  planFileFrontmatterSchema,
  resolvePlanRelationships,
  type PlanFileFrontmatter,
} from "@/lib/authoring/schemas";
import { PLAN_KINDS, type PlanKind } from "@/db/schema/plan/plan-kinds";
import {
  discoverFiles,
  loadAuthoringPaths,
  orderForApply,
  writeMergeAudit,
  type MergeSyncContext,
} from "./sync-shared";

export interface PlanSyncDiff {
  op: "added" | "modified" | "removed";
  slug: string;
  kind: PlanKind;
  path: string | null;
  fm: PlanFileFrontmatter | null;
  body: string;
  existing: ProjectTask | null;
  relationships: Array<{ kind: string; target: string }>;
}

export interface PlanSyncResult {
  applied: PlanSyncDiff[];
  parseErrors: Array<{ path: string; message: string }>;
  unresolvedRelationships: Array<{ from: string; to: string; kind: string }>;
}

function claimedPathOf(row: Pick<ProjectTask, "metadata">): string | null {
  const metadata = row.metadata ?? {};
  const source = metadata.source;
  if (typeof source !== "object" || source === null || Array.isArray(source)) return null;
  const claimedPath = (source as Record<string, unknown>).claimedPath;
  return typeof claimedPath === "string" && claimedPath.length > 0 ? claimedPath : null;
}

function metadataForFileClaimedPlan(
  fm: PlanFileFrontmatter,
  path: string | null,
  existing?: ProjectTask | null,
): Record<string, unknown> | null {
  const metadata: Record<string, unknown> = {
    ...(((fm as { details?: Record<string, unknown> }).details ?? {}) as Record<string, unknown>),
  };

  const existingMetadata = existing?.metadata ?? {};
  if (fm.classifications) {
    metadata.classifications = fm.classifications;
  } else if (Array.isArray(existingMetadata.classifications)) {
    metadata.classifications = existingMetadata.classifications;
  }
  if (typeof existingMetadata.effortEstimate === "string") {
    metadata.effortEstimate = existingMetadata.effortEstimate;
  }
  if (path) {
    metadata.source = {
      ...(typeof existingMetadata.source === "object" &&
      existingMetadata.source !== null &&
      !Array.isArray(existingMetadata.source)
        ? (existingMetadata.source as Record<string, unknown>)
        : {}),
      claimedPath: path,
    };
  }

  return Object.keys(metadata).length > 0 ? metadata : null;
}

export async function syncPlansFromMerge(ctx: MergeSyncContext): Promise<PlanSyncResult> {
  const paths = await loadAuthoringPaths(ctx);

  // Build the flat list of directory prefixes to scan, with kind hints.
  const prefixToKind = new Map<string, PlanKind>();
  for (const kind of PLAN_KINDS) {
    for (const prefix of paths.plans[kind] ?? []) {
      prefixToKind.set(prefix, kind);
    }
  }

  const { files, errors } = await discoverFiles(ctx, [...prefixToKind.keys()]);

  const incoming = new Map<
    string, // composite key "<kind>:<slug>"
    {
      kind: PlanKind;
      slug: string;
      path: string;
      fm: PlanFileFrontmatter;
      body: string;
      relationships: Array<{ kind: string; target: string }>;
    }
  >();

  for (const f of files) {
    // Infer kind from the directory prefix. Well-known paths (precedence 2)
    // may match multiple kinds; the first prefix that matches wins. If the
    // file's frontmatter `kind:` disagrees with the directory's kind, the
    // frontmatter wins — devs can drop a spec under docs/specs/ even when
    // .agents/plans/specs/ is the canonical home.
    const matchingPrefix = [...prefixToKind.keys()].find((p) => f.path.startsWith(p));
    if (!matchingPrefix) continue;
    const directoryKind = prefixToKind.get(matchingPrefix)!;
    const fmKindRaw = (f.parsed.data as { kind?: unknown }).kind;
    const fmKind = typeof fmKindRaw === "string" ? fmKindRaw : undefined;
    const isWellKnownPath = !matchingPrefix.startsWith(".agents/");
    // Well-known paths require explicit kind frontmatter per §7.1.
    if (isWellKnownPath && !fmKind) continue;

    const effectiveKind = (fmKind ?? directoryKind) as PlanKind;
    // Ensure `kind` is set on the frontmatter object before validation.
    const dataWithKind = { ...f.parsed.data, kind: effectiveKind };

    const result = planFileFrontmatterSchema.safeParse(dataWithKind);
    if (!result.success) {
      errors.push({
        path: f.path,
        message: `invalid plan frontmatter: ${result.error.message}`,
      });
      continue;
    }
    const fm = result.data;
    const compositeKey = `${effectiveKind}:${fm.slug}`;
    if (incoming.has(compositeKey)) {
      errors.push({
        path: f.path,
        message: `duplicate plan (${effectiveKind}:${fm.slug}) also at ${incoming.get(compositeKey)!.path}`,
      });
      continue;
    }
    incoming.set(compositeKey, {
      kind: effectiveKind,
      slug: fm.slug,
      path: f.path,
      fm,
      body: f.parsed.body.trim(),
      relationships: resolvePlanRelationships(fm),
    });
  }

  // Existing file-claimed plans for this project.
  const existing = await db.query.projectTasks.findMany({
    where: and(
      eq(projectTasks.organizationId, ctx.organizationId),
      eq(projectTasks.projectId, ctx.projectId),
      sql`${projectTasks.metadata}->'source'->>'claimedPath' is not null`,
    ),
  });
  const existingByKey = new Map(existing.map((p) => [`${p.kind}:${p.slug}`, p]));

  const diffs: PlanSyncDiff[] = [];

  // Removed
  for (const [key, row] of existingByKey) {
    if (incoming.has(key)) continue;
    diffs.push({
      op: "removed",
      slug: row.slug,
      kind: row.kind,
      path: claimedPathOf(row),
      fm: null,
      body: "",
      existing: row,
      relationships: [],
    });
  }

  // Added / modified
  for (const [key, item] of incoming) {
    const existingRow = existingByKey.get(key) ?? null;
    if (!existingRow) {
      diffs.push({
        op: "added",
        slug: item.slug,
        kind: item.kind,
        path: item.path,
        fm: item.fm,
        body: item.body,
        existing: null,
        relationships: item.relationships,
      });
      continue;
    }
    const bodyChanged = (existingRow.body ?? "").trim() !== item.body;
    const titleChanged = existingRow.title !== item.fm.title;
    const summaryChanged = (existingRow.summary ?? "") !== (item.fm.summary ?? "");
    const metadataChanged =
      JSON.stringify(existingRow.metadata ?? {}) !==
      JSON.stringify(metadataForFileClaimedPlan(item.fm, item.path, existingRow) ?? {});
    if (!bodyChanged && !titleChanged && !summaryChanged && !metadataChanged) continue;

    diffs.push({
      op: "modified",
      slug: item.slug,
      kind: item.kind,
      path: item.path,
      fm: item.fm,
      body: item.body,
      existing: existingRow,
      relationships: item.relationships,
    });
  }

  if (ctx.preview) {
    return { applied: diffs, parseErrors: errors, unresolvedRelationships: [] };
  }

  const unresolved: Array<{ from: string; to: string; kind: string }> = [];
  for (const diff of orderForApply(diffs)) {
    try {
      const r = await applyOne(ctx, diff);
      unresolved.push(...r.unresolved);
    } catch (err) {
      errors.push({
        path: diff.path ?? `<${diff.kind}:${diff.slug}>`,
        message: `apply failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return { applied: diffs, parseErrors: errors, unresolvedRelationships: unresolved };
}

async function applyOne(
  ctx: MergeSyncContext,
  diff: PlanSyncDiff,
): Promise<{ unresolved: Array<{ from: string; to: string; kind: string }> }> {
  const invokedVia = ctx.prNumber
    ? `merge-webhook:pr#${ctx.prNumber}`
    : "merge-webhook:push";

  if (diff.op === "removed" && diff.existing) {
    // Soft-delete: status → cancelled, leave the row for audit lookups.
    await db
      .update(projectTasks)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(projectTasks.id, diff.existing.id));
    await writeMergeAudit({
      organizationId: ctx.organizationId,
      action: "plan.removed-soft",
      entityType: "project_task",
      entityId: diff.existing.id,
      summary: `file removed; status → cancelled (${diff.kind}:${diff.slug})`,
      before: { status: diff.existing.status, claimedPath: claimedPathOf(diff.existing) },
      after: { status: "cancelled" },
      invokedVia,
    });
    return { unresolved: [] };
  }

  if (!diff.fm) return { unresolved: [] };

  let planId: string;
  let beforeSnapshot: Record<string, unknown> | null = null;
  if (diff.op === "added") {
    // Default status on add is `draft` — PR lifecycle handler bumps to
    // `in_review` when the file's PR is open / `approved` on merge.
    const inserted = await db
      .insert(projectTasks)
      .values({
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        kind: diff.kind,
        slug: diff.slug,
        title: diff.fm.title,
        summary: diff.fm.summary ?? null,
        body: diff.body,
        metadata: metadataForFileClaimedPlan(diff.fm, diff.path),
        status: "draft",
        priority: diff.fm.priority ?? null,
        externalRef: diff.fm.externalRef ?? null,
        assigneeName: diff.fm.assignee ?? null,
      })
      .returning({ id: projectTasks.id });
    planId = inserted[0].id;
    await writeMergeAudit({
      organizationId: ctx.organizationId,
      action: "plan.create",
      entityType: "project_task",
      entityId: planId,
      summary: `created file-claimed plan ${diff.kind}:${diff.slug}`,
      after: { fm: diff.fm, claimedPath: diff.path },
      invokedVia,
    });
  } else if (diff.op === "modified" && diff.existing) {
    planId = diff.existing.id;
    beforeSnapshot = {
      title: diff.existing.title,
      summary: diff.existing.summary,
      body: diff.existing.body,
      metadata: diff.existing.metadata,
    };
    await db
      .update(projectTasks)
      .set({
        title: diff.fm.title,
        summary: diff.fm.summary ?? null,
        body: diff.body,
        metadata: metadataForFileClaimedPlan(diff.fm, diff.path, diff.existing),
        priority: diff.fm.priority ?? diff.existing.priority,
        externalRef: diff.fm.externalRef ?? diff.existing.externalRef,
        assigneeName: diff.fm.assignee ?? diff.existing.assigneeName,
        updatedAt: new Date(),
      })
      .where(eq(projectTasks.id, planId));
    await writeMergeAudit({
      organizationId: ctx.organizationId,
      action: "plan.update",
      entityType: "project_task",
      entityId: planId,
      summary: `updated file-claimed plan ${diff.kind}:${diff.slug}`,
      before: beforeSnapshot,
      after: { fm: diff.fm },
      invokedVia,
    });
  } else {
    return { unresolved: [] };
  }

  // Relationship reconciliation.
  return await reconcileRelationships(ctx, planId, diff.relationships);
}

async function reconcileRelationships(
  ctx: MergeSyncContext,
  planId: string,
  desired: Array<{ kind: string; target: string }>,
): Promise<{ unresolved: Array<{ from: string; to: string; kind: string }> }> {
  if (desired.length === 0) return { unresolved: [] };

  // Resolve slug targets to IDs. A slug can be ambiguous across kinds —
  // first-match wins; devs can use frontmatter `relationships: [{kind, target}]`
  // with a kind-qualified slug if needed (out of MVP scope to enforce).
  const targets = await db.query.projectTasks.findMany({
    where: and(
      eq(projectTasks.organizationId, ctx.organizationId),
      eq(projectTasks.projectId, ctx.projectId),
      inArray(
        projectTasks.slug,
        desired.map((d) => d.target),
      ),
    ),
  });
  const targetBySlug = new Map(targets.map((t) => [t.slug, t]));

  // Read existing relationships for `planId` to compute the diff.
  const existing = await db.query.planRelationships.findMany({
    where: eq(planRelationships.fromProjectTasksId, planId),
  });

  const desiredKeys = new Set<string>();
  const unresolved: Array<{ from: string; to: string; kind: string }> = [];

  for (const d of desired) {
    const target = targetBySlug.get(d.target);
    if (!target) {
      unresolved.push({ from: planId, to: d.target, kind: d.kind });
      continue;
    }
    desiredKeys.add(`${d.kind}:${target.id}`);
  }

  // Delete existing rels not in desired
  for (const e of existing) {
    if (!desiredKeys.has(`${e.kind}:${e.toProjectTasksId}`)) {
      await db
        .delete(planRelationships)
        .where(eq(planRelationships.id, e.id));
    }
  }

  // Insert desired rels not in existing
  const existingKeys = new Set(existing.map((e) => `${e.kind}:${e.toProjectTasksId}`));
  for (const d of desired) {
    const target = targetBySlug.get(d.target);
    if (!target) continue;
    const key = `${d.kind}:${target.id}`;
    if (existingKeys.has(key)) continue;
    await db
      .insert(planRelationships)
      .values({
        organizationId: ctx.organizationId,
        fromProjectTasksId: planId,
        toProjectTasksId: target.id,
        kind: d.kind as "parent_of",
      })
      .onConflictDoNothing();
  }

  return { unresolved };
}
