import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { governanceRecords } from "@/db/schema/governance/records";
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

import { PlansClient } from "./PlansClient";
import { serializePlanRow, type PlanRowClient, type PlansPageClient } from "./serialize";

type PlanWithProject = PlanArtifact & { project?: Project | null };

export default async function PlansPage() {
  const ctx = await getActionContext();
  const { items, total } = await planCrud.list({ limit: 200, sortBy: "updatedAt", sortOrder: "desc" });
  const planItems = items as PlanWithProject[];

  // Pending governance records (kind=approval) targeting any of the loaded
  // plans. Drives the "Needs approval" filter chip and per-row affordance.
  const planIds = planItems.map((p) => p.id);
  const pendingByPlanId = new Set<string>();
  if (planIds.length > 0) {
    const pendingRows = await db
      .select({ planArtifactId: governanceRecords.planArtifactId })
      .from(governanceRecords)
      .where(
        and(
          eq(governanceRecords.organizationId, ctx.organizationId),
          eq(governanceRecords.status, "pending"),
          eq(governanceRecords.kind, "approval"),
          inArray(governanceRecords.planArtifactId, planIds),
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

  const data: PlansPageClient = {
    rows,
    counts: { total, byStatus, byKind, needsApproval: needsApprovalCount },
  };

  return <PlansClient data={data} />;
}
