import type { AdapterBinding } from "@/db/schema/adapter-binding";
// AdapterBinding currently has no last-sync column; we surface externalKey
// instead. Sync history will be added when integrations expose it.
import type { Deployment, DeploymentStatus } from "@/db/schema/deployment";
import type { Environment } from "@/db/schema/environment";
import type { ProjectTask } from "@/db/schema/plan/project-task";
import type { Project, ProjectStatus } from "@/db/schema/project";
import type { Repository } from "@/db/schema/repository";
import type { Rule, RuleSeverity } from "@/db/schema/rule";
import type { Skill } from "@/db/schema/skill/skill";
import type { WorkItem, WorkItemKind, WorkItemSource } from "@/db/schema/work-item";

export interface CockpitProjectClient {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  criticalPaths: string[];
  productionCriticalPaths: string[];
  /** When true, the execution gate refuses to clear PRs without an approval row. */
  requireHumanApprovalForMerge: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CockpitBindingClient {
  id: string;
  provider: string;
  externalKey: string;
  updatedAt: string;
}

export interface CockpitPlanClient {
  id: string;
  title: string;
  kind: string;
  status: string;
  updatedAt: string;
}

export interface CockpitRuleClient {
  id: string;
  slug: string;
  title: string;
  severity: RuleSeverity;
  scope: "project" | "org";
  tags: string[];
}

export interface CockpitSkillClient {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  scope: "project" | "org";
  isPlatform: boolean;
}

export interface CockpitWorkItemClient {
  id: string;
  source: WorkItemSource;
  externalId: string;
  externalUrl: string | null;
  kind: WorkItemKind | null;
  title: string;
  status: string | null;
  assigneeEmail: string | null;
  projectTaskId: string | null;
  lastSyncedAt: string | null;
  updatedAt: string;
}

export interface CockpitDeploymentClient {
  id: string;
  environment: string;
  version: string;
  commitSha: string | null;
  status: DeploymentStatus;
  deployedByName: string | null;
  ciRunUrl: string | null;
  notes: string | null;
  startedAt: string;
  completedAt: string | null;
  rolledBackAt: string | null;
}

export interface CockpitRepositoryClient {
  id: string;
  source: string;
  identifier: string;
  url: string | null;
  defaultBranch: string | null;
}

export interface CockpitEnvironmentClient {
  id: string;
  name: string;
  tier: string | null;
  url: string | null;
}

export function serializeCockpitProject(p: Project): CockpitProjectClient {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    status: p.status,
    criticalPaths: p.criticalPaths ?? [],
    productionCriticalPaths: p.productionCriticalPaths ?? [],
    requireHumanApprovalForMerge: p.requireHumanApprovalForMerge,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function serializeCockpitBinding(b: AdapterBinding): CockpitBindingClient {
  return {
    id: b.id,
    provider: b.provider,
    externalKey: b.externalKey,
    updatedAt: b.updatedAt.toISOString(),
  };
}

export function serializeCockpitPlan(p: ProjectTask): CockpitPlanClient {
  return {
    id: p.id,
    title: p.title,
    kind: p.kind,
    status: p.status,
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function serializeCockpitRule(r: Rule, currentProjectId: string): CockpitRuleClient {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    severity: r.severity,
    scope: r.projectId === currentProjectId ? "project" : "org",
    tags: r.tags ?? [],
  };
}

export function serializeCockpitSkill(s: Skill, currentProjectId: string): CockpitSkillClient {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    scope: s.projectId === currentProjectId ? "project" : "org",
    isPlatform: Array.isArray(s.tags) ? s.tags.includes("platform") : false,
  };
}

export function serializeCockpitWorkItem(w: WorkItem): CockpitWorkItemClient {
  return {
    id: w.id,
    source: w.source,
    externalId: w.externalId,
    externalUrl: w.externalUrl,
    kind: w.kind,
    title: w.title,
    status: w.status,
    assigneeEmail: w.assigneeEmail,
    projectTaskId: w.projectTaskId,
    lastSyncedAt: w.lastSyncedAt?.toISOString() ?? null,
    updatedAt: w.updatedAt.toISOString(),
  };
}

export function serializeCockpitDeployment(d: Deployment): CockpitDeploymentClient {
  return {
    id: d.id,
    environment: d.environment,
    version: d.version,
    commitSha: d.commitSha,
    status: d.status,
    deployedByName: d.deployedByName,
    ciRunUrl: d.ciRunUrl,
    notes: d.notes,
    startedAt: d.startedAt.toISOString(),
    completedAt: d.completedAt?.toISOString() ?? null,
    rolledBackAt: d.rolledBackAt?.toISOString() ?? null,
  };
}

export function serializeCockpitRepository(r: Repository): CockpitRepositoryClient {
  return {
    id: r.id,
    source: r.source,
    identifier: r.identifier,
    url: r.url ?? null,
    defaultBranch: r.defaultBranch ?? null,
  };
}

export function serializeCockpitEnvironment(e: Environment): CockpitEnvironmentClient {
  return {
    id: e.id,
    name: e.name,
    tier: e.tier ?? null,
    url: e.url ?? null,
  };
}
