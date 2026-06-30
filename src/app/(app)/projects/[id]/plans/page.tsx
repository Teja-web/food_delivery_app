import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { governanceRecords } from "@/db/schema/governance/records";
import { Toaster } from "@/components/ui/sonner";
import {
  PLAN_KINDS,
  PLAN_STATUSES,
  type PlanArtifact,
  type PlanKind,
  type PlanStatus,
} from "@/db/schema/plan/plan-artifact";
import type { Project } from "@/db/schema/project";
import { getActionContext } from "@/lib/auth/context";
import { planCrud } from "@/operations/plan/plans";
import { listRelationshipsForPlans } from "@/operations/plan/relationships";

import { PlansClient } from "@/app/(app)/plans/PlansClient";
import {
  serializePlanRow,
  type PlanRelationshipRowClient,
  type PlanRowClient,
  type PlansPageClient,
} from "@/app/(app)/plans/serialize";

type PlanWithProject = PlanArtifact & { project?: Project | null };

/**
 * Project-scoped plans tab. Re-uses the global PlansClient with a server-side
 * filter on projectId. Kind / status / needs-approval all live as filter chips
 * per spec §11.3.
 */
export default async function ProjectPlansPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getActionContext();

  const all = await planCrud.list({ limit: 200, sortBy: "updatedAt", sortOrder: "desc" });
  const planItems = (all.items as PlanWithProject[]).filter((p) => p.projectId === id);

  const pendingByPlanId = new Set<string>();
  if (planItems.length > 0) {
    const pendingRows = await db
      .select({ planArtifactId: governanceRecords.planArtifactId })
      .from(governanceRecords)
      .where(
        and(
          eq(governanceRecords.organizationId, ctx.organizationId),
          eq(governanceRecords.projectId, id),
          eq(governanceRecords.kind, "approval"),
          eq(governanceRecords.status, "pending"),
        ),
      );
    for (const r of pendingRows) pendingByPlanId.add(r.planArtifactId);
  }

  const rows: PlanRowClient[] = planItems.map((p) =>
    serializePlanRow(p, { needsApproval: pendingByPlanId.has(p.id) }),
  );

  const byStatus = PLAN_STATUSES.reduce(
    (acc, s) => ({ ...acc, [s]: 0 }),
    {} as Record<PlanStatus, number>,
  );
  const byKind = PLAN_KINDS.reduce(
    (acc, k) => ({ ...acc, [k]: 0 }),
    {} as Record<PlanKind, number>,
  );
  let needsApprovalCount = 0;
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    if (r.needsApproval) needsApprovalCount += 1;
  }

  const relationshipRows = await listRelationshipsForPlans(
    planItems.map((p) => p.id),
    { kind: "parent_of" },
  );
  const relationships: PlanRelationshipRowClient[] = relationshipRows.map((r) => ({
    fromPlanArtifactId: r.fromPlanArtifactId,
    toPlanArtifactId: r.toPlanArtifactId,
    kind: r.kind,
  }));

  const data: PlansPageClient = {
    rows,
    relationships,
    projectId: id,
    counts: { total: rows.length, byStatus, byKind, needsApproval: needsApprovalCount },
  };

  return (
    <>
      <PlansClient data={data} />
      <Toaster />
    </>
  );
}
