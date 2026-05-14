import { PLAN_KINDS, PLAN_STATUSES, type Plan, type PlanKind, type PlanStatus } from "@/db/schema/plan";
import type { Project } from "@/db/schema/project";
import { planCrud } from "@/operations/plans";

import { PlansClient } from "./PlansClient";
import { serializePlanRow, type PlanRowClient, type PlansPageClient } from "./serialize";

type PlanWithProject = Plan & { project?: Project | null };

export default async function PlansPage() {
  const { items, total } = await planCrud.list({ limit: 200, sortBy: "updatedAt", sortOrder: "desc" });
  const rows: PlanRowClient[] = (items as PlanWithProject[]).map((p) => serializePlanRow(p));

  const byStatus = PLAN_STATUSES.reduce(
    (acc, s) => ({ ...acc, [s]: 0 }),
    {} as Record<PlanStatus, number>,
  );
  const byKind = PLAN_KINDS.reduce(
    (acc, k) => ({ ...acc, [k]: 0 }),
    {} as Record<PlanKind, number>,
  );
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  }

  const data: PlansPageClient = {
    rows,
    counts: { total, byStatus, byKind },
  };

  return <PlansClient data={data} />;
}
