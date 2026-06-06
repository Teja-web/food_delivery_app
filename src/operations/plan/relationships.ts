/**
 * Plan Relationship CRUD — typed links between plan_artifacts.
 *
 * Kinds: parent_of | supersedes | derived_from | blocks | relates_to | causes | references.
 * `parent_of` is dominant but doesn't get a special path — one relationship surface.
 */

import { z } from "zod/v4";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import {
  planRelationships,
  PLAN_RELATIONSHIP_KINDS,
  type PlanRelationshipKind,
} from "@/db/schema/plan/plan-relationship";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { getActionContext } from "@/lib/auth/context";

const relSchema = z.object({
  fromPlanArtifactId: z.string().min(1),
  toPlanArtifactId: z.string().min(1),
  kind: z.enum(PLAN_RELATIONSHIP_KINDS),
  note: z.string().nullable().optional(),
});

export const planRelationshipCrud = createEntityCrud({
  db,
  table: planRelationships,
  queryKey: "planRelationships",
  idField: "id",
  schema: relSchema,
  searchFields: [],
  onMutate: () => safeRevalidate("/plans"),
});

export async function listRelationshipsForPlan(
  planArtifactId: string,
  opts: { kind?: PlanRelationshipKind } = {},
) {
  const ctx = await getActionContext();
  const conditions = [
    eq(planRelationships.organizationId, ctx.organizationId),
    or(
      eq(planRelationships.fromPlanArtifactId, planArtifactId),
      eq(planRelationships.toPlanArtifactId, planArtifactId),
    ),
  ];
  if (opts.kind) conditions.push(eq(planRelationships.kind, opts.kind));
  return db.query.planRelationships.findMany({
    where: and(...conditions),
  });
}
