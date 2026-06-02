import { and, eq, inArray, or } from "drizzle-orm";

import { db } from "@/db/client";
import { approvals } from "@/db/schema/plan/approval";
import { PLAN_KINDS, PLAN_STATUSES, type Plan, type PlanKind, type PlanStatus } from "@/db/schema/plan/plan";
import type { Project } from "@/db/schema/project";
import { getActionContext } from "@/lib/auth/context";
import { planCrud } from "@/operations/plan/plans";

import { PlansClient } from "./PlansClient";
import { serializePlanRow, type PlanRowClient, type PlansPageClient } from "./serialize";

type PlanWithProject = Plan & { project?: Project | null };

export default async function PlansPage() {
  const ctx = await getActionContext();
  const { items, total } = await planCrud.list({ limit: 200, sortBy: "updatedAt", sortOrder: "desc" });
  const planItems = items as PlanWithProject[];

  // Pending approvals targeting any of the loaded plans. Approval rows are
  // polymorphic — `release_plan` plans show up as entityType="release"
  // because /releases routes through the same approval flow. Match both.
  const planIds = planItems.map((p) => p.id);
  const pendingByPlanId = new Set<string>();
  if (planIds.length > 0) {
    const pendingRows = await db
      .select({ entityId: approvals.entityId })
      .from(approvals)
      .where(
        and(
          eq(approvals.organizationId, ctx.organizationId),
          eq(approvals.status, "pending"),
          or(eq(approvals.entityType, "plan"), eq(approvals.entityType, "release")),
          inArray(approvals.entityId, planIds),
        ),
      );
    for (const r of pendingRows) pendingByPlanId.add(r.entityId);
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
