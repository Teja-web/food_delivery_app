import { getActionContext } from "@/lib/auth/context";
import { db } from "@/db/client";
import { eq, and, desc } from "drizzle-orm";

import { listDeployments } from "@/operations/deployments";
import { listPlansByKind } from "@/operations/plans";
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

  const data: ReleasesPageData = {
    plans: plans.map(serializeReleasePlan),
    recentDeployments: deploys.map((d) =>
      serializeReleaseDeployment(d, projectNameById.get(d.projectId) ?? "Unknown project"),
    ),
  };

  return <ReleasesClient data={data} />;
}
