import { getActionContext } from "@/lib/auth/context";
import { db } from "@/db/client";
import { eq, and, desc, inArray, or } from "drizzle-orm";

import { approvals } from "@/db/schema/plan/approval";
import { listDeployments } from "@/operations/work/deployments";
import { listPlansByKind } from "@/operations/plan/plans";
import { projects } from "@/db/schema/project";

import { ReleasesClient } from "./ReleasesClient";
import {
  serializeReleaseDeployment,
  serializeReleasePlan,
  type ReleasesPageData,
} from "./serialize";

export default async function ReleasesPage() {
  const ctx = await getActionContext();

  const [plans, deploys, projectRows] = await Promise.all([
    listPlansByKind("release_plan", { limit: 100 }),
    listDeployments({ limit: 50 }),
    db.query.projects.findMany({
      where: and(eq(projects.organizationId, ctx.organizationId)),
      orderBy: [desc(projects.updatedAt)],
    }),
  ]);

  const projectNameById = new Map(projectRows.map((p) => [p.id, p.name]));

  // Pending approvals targeting any loaded release plan. Approvals carry
  // entityType="release" (legacy) or "plan" — match both.
  const planIds = plans.map((p) => p.id);
  const pendingByPlanId = new Set<string>();
  if (planIds.length > 0) {
    const pendingRows = await db
      .select({ entityId: approvals.entityId })
      .from(approvals)
      .where(
        and(
          eq(approvals.organizationId, ctx.organizationId),
          eq(approvals.status, "pending"),
          or(eq(approvals.entityType, "release"), eq(approvals.entityType, "plan")),
          inArray(approvals.entityId, planIds),
        ),
      );
    for (const r of pendingRows) pendingByPlanId.add(r.entityId);
  }

  const data: ReleasesPageData = {
    plans: plans.map((p) =>
      serializeReleasePlan(p, { needsApproval: pendingByPlanId.has(p.id) }),
    ),
    recentDeployments: deploys.map((d) =>
      serializeReleaseDeployment(d, projectNameById.get(d.projectId) ?? "Unknown project"),
    ),
  };

  return <ReleasesClient data={data} />;
}
