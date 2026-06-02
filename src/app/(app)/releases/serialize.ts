import type { Deployment, DeploymentStatus } from "@/db/schema/deployment";
import type { Plan } from "@/db/schema/plan/plan";
import type { Project } from "@/db/schema/project";

export interface ReleasePlanClient {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  projectId: string;
  projectName: string;
  projectSlug: string;
  updatedAt: string;
  dueDate: string | null;
  /** Pending Approval row targeting this release_plan. */
  needsApproval: boolean;
}

export interface ReleaseDeploymentClient {
  id: string;
  projectId: string;
  projectName: string;
  environment: string;
  version: string;
  status: DeploymentStatus;
  deployedByName: string | null;
  startedAt: string;
  completedAt: string | null;
  rolledBackAt: string | null;
}

export interface ReleasesPageData {
  plans: ReleasePlanClient[];
  recentDeployments: ReleaseDeploymentClient[];
}

export function serializeReleasePlan(
  p: Plan & { project: Project | null },
  opts: { needsApproval?: boolean } = {},
): ReleasePlanClient {
  return {
    id: p.id,
    title: p.title,
    status: p.status,
    priority: p.priority ?? null,
    projectId: p.projectId,
    projectName: p.project?.name ?? "Unknown project",
    projectSlug: p.project?.slug ?? "",
    updatedAt: p.updatedAt.toISOString(),
    dueDate: p.dueDate?.toISOString() ?? null,
    needsApproval: opts.needsApproval ?? false,
  };
}

export function serializeReleaseDeployment(
  d: Deployment,
  projectName: string,
): ReleaseDeploymentClient {
  return {
    id: d.id,
    projectId: d.projectId,
    projectName,
    environment: d.environment,
    version: d.version,
    status: d.status,
    deployedByName: d.deployedByName,
    startedAt: d.startedAt.toISOString(),
    completedAt: d.completedAt?.toISOString() ?? null,
    rolledBackAt: d.rolledBackAt?.toISOString() ?? null,
  };
}
