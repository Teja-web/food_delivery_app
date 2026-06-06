/**
 * Evidence Links — attach/list/dereference proof artifacts on a plan_artifact.
 *
 * One attach op regardless of evidenceType. Type-specific resolution at
 * dereference time only. The single canonical attachment surface; legacy
 * `work_items.planArtifactId` is a fast lookup but evidence flows through here.
 */

import { z } from "zod/v4";
import { and, desc, eq } from "drizzle-orm";
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
import { planArtifacts } from "@/db/schema/plan/plan-artifact";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { getActionContext } from "@/lib/auth/context";

const evidenceSchema = z.object({
  projectId: z.string().min(1),
  planArtifactId: z.string().min(1),
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

export async function listEvidenceForPlan(planArtifactId: string) {
  const ctx = await getActionContext();
  return db.query.evidenceLinks.findMany({
    where: and(
      eq(evidenceLinks.organizationId, ctx.organizationId),
      eq(evidenceLinks.planArtifactId, planArtifactId),
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

type DereferenceResult =
  | { type: "deployment"; target: typeof deployments.$inferSelect | null }
  | { type: "test_run"; target: typeof testRuns.$inferSelect | null }
  | { type: "metric_snapshot"; target: typeof metrics.$inferSelect | null }
  | { type: "work_item"; target: typeof workItems.$inferSelect | null }
  | { type: "skill_outcome"; target: typeof skillOutcomes.$inferSelect | null }
  | { type: "incident"; target: typeof planArtifacts.$inferSelect | null }
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
        ? ((await db.query.planArtifacts.findFirst({
            where: eq(planArtifacts.id, link.evidenceId),
          })) ?? null)
        : null;
      return { type: "incident", target };
    }
    case "external_link":
      return { type: "external_link", target: { url: link.externalUrl } };
  }
}

export type { EvidenceType };
