/**
 * Evidence Links — attach/list/dereference proof artifacts on a project_task.
 *
 * One attach op regardless of evidenceType. Type-specific resolution at
 * dereference time only. The single canonical attachment surface; legacy
 * `work_items.projectTaskId` is a fast lookup but evidence flows through here.
 */

import { z } from "zod/v4";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import {
  evidenceLinks,
  EVIDENCE_TYPES,
  EVIDENCE_ROLES,
  type EvidenceType,
} from "@/db/schema/evidence";
import { deployments } from "@/db/schema/deployment";
import { testRuns } from "@/db/schema/test-run";
import { workItems } from "@/db/schema/work-item";
import { metrics } from "@/db/schema/metric";
import { skillOutcomes } from "@/db/schema/skill/skill-outcome";
import { projectTasks } from "@/db/schema/plan/project-task";
import type { PlanKind } from "@/db/schema/plan/plan-kinds";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { getActionContext } from "@/lib/auth/context";

const evidenceSchema = z.object({
  projectId: z.string().min(1),
  projectTaskId: z.string().min(1),
  evidenceType: z.enum(EVIDENCE_TYPES),
  evidenceId: z.string().nullable().optional(),
  externalUrl: z.string().url().nullable().optional(),
  role: z.enum(EVIDENCE_ROLES).nullable().optional(),
  note: z.string().nullable().optional(),
  attachedById: z.string().nullable().optional(),
  attachedByName: z.string().nullable().optional(),
});

export const evidenceCrud = createEntityCrud({
  db,
  table: evidenceLinks,
  queryKey: "evidenceLinks",
  idField: "id",
  schema: evidenceSchema,
  searchFields: [],
  onMutate: () => safeRevalidate("/evidence"),
});

export async function attachEvidence(args: z.input<typeof evidenceSchema>) {
  const ctx = await getActionContext();
  return evidenceCrud.create({
    ...args,
    attachedById: args.attachedById ?? ctx.userId,
    attachedByName: args.attachedByName ?? ctx.user.name,
  });
}

export async function listEvidenceForPlan(projectTaskId: string) {
  const ctx = await getActionContext();
  return db.query.evidenceLinks.findMany({
    where: and(
      eq(evidenceLinks.organizationId, ctx.organizationId),
      eq(evidenceLinks.projectTaskId, projectTaskId),
    ),
    orderBy: [desc(evidenceLinks.attachedAt)],
  });
}

export async function listEvidenceForProject(projectId: string) {
  const ctx = await getActionContext();
  return db.query.evidenceLinks.findMany({
    where: and(
      eq(evidenceLinks.organizationId, ctx.organizationId),
      eq(evidenceLinks.projectId, projectId),
    ),
    orderBy: [desc(evidenceLinks.attachedAt)],
  });
}

/**
 * Verification debt — project tasks that crossed into `completed` within
 * the trailing window but carry no `evidence_links` row of any of the
 * expected types for their kind. Load-bearing read for the Trust pillar:
 * a non-zero count means promises made (plan completed) are not yet
 * matched by proof attached.
 *
 * Expectations per kind are intentionally minimal — a plan is "in debt"
 * only when ALL of its expected evidence types are missing. A plan can
 * satisfy debt with one well-placed link; demanding several types each
 * would generate noise and is left to per-policy gates.
 */
export const PLAN_EXPECTED_EVIDENCE: Partial<Record<PlanKind, EvidenceType[]>> = {
  story: ["work_item", "deployment"],
  feature: ["work_item", "deployment"],
  release_plan: ["deployment"],
  test_plan: ["test_run"],
  spec: ["work_item"],
  incident: ["incident", "external_link"],
};

export type StaleEvidenceRow = {
  projectTaskId: string;
  planKind: PlanKind;
  planTitle: string;
  completedAt: Date;
  expectedTypes: EvidenceType[];
};

export async function getStaleEvidence(args: {
  projectId?: string;
  windowDays?: number;
}): Promise<StaleEvidenceRow[]> {
  const ctx = await getActionContext();
  const windowDays = args.windowDays ?? 30;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const conditions = [
    eq(projectTasks.organizationId, ctx.organizationId),
    eq(projectTasks.status, "completed"),
    gte(projectTasks.updatedAt, since),
  ];
  if (args.projectId) conditions.push(eq(projectTasks.projectId, args.projectId));

  const plans = await db
    .select({
      id: projectTasks.id,
      kind: projectTasks.kind,
      title: projectTasks.title,
      updatedAt: projectTasks.updatedAt,
    })
    .from(projectTasks)
    .where(and(...conditions));

  if (plans.length === 0) return [];

  const planIds = plans.map((p) => p.id);
  const attached = await db
    .select({
      projectTaskId: evidenceLinks.projectTaskId,
      evidenceType: evidenceLinks.evidenceType,
    })
    .from(evidenceLinks)
    .where(
      and(
        eq(evidenceLinks.organizationId, ctx.organizationId),
        sql`${evidenceLinks.projectTaskId} = ANY(${planIds})`,
      ),
    );

  const attachedByPlan = new Map<string, Set<EvidenceType>>();
  for (const row of attached) {
    let set = attachedByPlan.get(row.projectTaskId);
    if (!set) {
      set = new Set();
      attachedByPlan.set(row.projectTaskId, set);
    }
    set.add(row.evidenceType);
  }

  const stale: StaleEvidenceRow[] = [];
  for (const plan of plans) {
    const expected = PLAN_EXPECTED_EVIDENCE[plan.kind];
    if (!expected || expected.length === 0) continue;
    const have = attachedByPlan.get(plan.id) ?? new Set();
    const allMissing = expected.every((t) => !have.has(t));
    if (!allMissing) continue;
    stale.push({
      projectTaskId: plan.id,
      planKind: plan.kind,
      planTitle: plan.title,
      completedAt: plan.updatedAt,
      expectedTypes: expected,
    });
  }
  stale.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
  return stale;
}

type DereferenceResult =
  | { type: "deployment"; target: typeof deployments.$inferSelect | null }
  | { type: "test_run"; target: typeof testRuns.$inferSelect | null }
  | { type: "metric_snapshot"; target: typeof metrics.$inferSelect | null }
  | { type: "work_item"; target: typeof workItems.$inferSelect | null }
  | { type: "skill_outcome"; target: typeof skillOutcomes.$inferSelect | null }
  | { type: "incident"; target: typeof projectTasks.$inferSelect | null }
  | { type: "external_link"; target: { url: string | null } };

/** Resolve a single evidence link to its typed target. */
export async function dereferenceEvidence(link: typeof evidenceLinks.$inferSelect): Promise<DereferenceResult> {
  switch (link.evidenceType) {
    case "deployment": {
      const target = link.evidenceId
        ? ((await db.query.deployments.findFirst({
            where: eq(deployments.id, link.evidenceId),
          })) ?? null)
        : null;
      return { type: "deployment", target };
    }
    case "test_run": {
      const target = link.evidenceId
        ? ((await db.query.testRuns.findFirst({ where: eq(testRuns.id, link.evidenceId) })) ?? null)
        : null;
      return { type: "test_run", target };
    }
    case "metric_snapshot": {
      const target = link.evidenceId
        ? ((await db.query.metrics.findFirst({ where: eq(metrics.id, link.evidenceId) })) ?? null)
        : null;
      return { type: "metric_snapshot", target };
    }
    case "work_item": {
      const target = link.evidenceId
        ? ((await db.query.workItems.findFirst({ where: eq(workItems.id, link.evidenceId) })) ?? null)
        : null;
      return { type: "work_item", target };
    }
    case "skill_outcome": {
      const target = link.evidenceId
        ? ((await db.query.skillOutcomes.findFirst({
            where: eq(skillOutcomes.id, link.evidenceId),
          })) ?? null)
        : null;
      return { type: "skill_outcome", target };
    }
    case "incident": {
      const target = link.evidenceId
        ? ((await db.query.projectTasks.findFirst({
            where: eq(projectTasks.id, link.evidenceId),
          })) ?? null)
        : null;
      return { type: "incident", target };
    }
    case "external_link":
      return { type: "external_link", target: { url: link.externalUrl } };
  }
}

export type { EvidenceType };
