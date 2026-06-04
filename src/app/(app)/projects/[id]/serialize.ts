import type { AdapterBinding } from "@/db/schema/adapter-binding";
// AdapterBinding currently has no last-sync column; we surface externalKey
// instead. Sync history will be added when integrations expose it.
import type { Deployment, DeploymentStatus } from "@/db/schema/deployment";
import type { GateType, PhaseGate } from "@/db/schema/phase-gate";
import type { Plan } from "@/db/schema/plan/plan";
import type { Project, ProjectPhase, ProjectStatus } from "@/db/schema/project";
import type { Rule, RuleSeverity } from "@/db/schema/rule";
import type { Skill } from "@/db/schema/skill/skill";
import type { WorkItem, WorkItemKind, WorkItemSource } from "@/db/schema/work-item";

export interface CockpitProjectClient {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phase: ProjectPhase;
  status: ProjectStatus;
  repoUrl: string | null;
  jiraProjectKey: string | null;
  adoProjectId: string | null;
  confluenceSpaceKey: string | null;
  criticalPaths: string[];
  productionCriticalPaths: string[];
  /** When true, the execution gate refuses to clear PRs without an approval row. */
  requireHumanApprovalForMerge: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CockpitGateClient {
  id: string;
  name: string;
  description: string | null;
  type: GateType;
  threshold: number | null;
  status: "pending" | "passed" | "failed" | "skipped";
  unmetCriterion: string | null;
  assigneeName: string | null;
  ageLabel: string | null;
  lastGreenAt: string | null;
  /**
   * Open approval rows targeting this gate. > 0 means a reviewer was asked
   * but hasn't decided yet (typical after `submit_phase_for_review`). UI
   * renders an "in review" badge so the gate's pending state is visible on
   * the project cockpit, not buried only in the approvals inbox.
   */
  pendingApprovalCount: number;
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
  /** null = all phases */
  phase: string | null;
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
  planId: string | null;
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

export interface CockpitGatesByPhase {
  phase: ProjectPhase;
  label: string;
  gates: CockpitGateClient[];
}

function formatAge(date: Date | null | undefined): string | null {
  if (!date) return null;
  const ms = Date.now() - date.getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor(ms / (60 * 1000));
  if (days >= 1) return `${days}d`;
  if (hours >= 1) return `${hours}h`;
  if (minutes >= 1) return `${minutes}m`;
  return "just now";
}

export function serializeCockpitProject(p: Project): CockpitProjectClient {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    phase: p.phase,
    status: p.status,
    repoUrl: p.repoUrl,
    jiraProjectKey: p.jiraProjectKey,
    adoProjectId: p.adoProjectId,
    confluenceSpaceKey: p.confluenceSpaceKey,
    criticalPaths: p.criticalPaths ?? [],
    productionCriticalPaths: p.productionCriticalPaths ?? [],
    requireHumanApprovalForMerge: p.requireHumanApprovalForMerge,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function serializeCockpitGate(
  g: PhaseGate,
  pendingApprovalCount = 0,
): CockpitGateClient {
  return {
    id: g.id,
    name: g.name,
    description: g.description ?? null,
    type: g.type,
    threshold: g.threshold ?? null,
    status: g.status,
    unmetCriterion: g.unmetCriterion ?? null,
    assigneeName: g.assigneeName ?? null,
    ageLabel: formatAge(g.lastChangedAt),
    lastGreenAt: g.lastGreenAt?.toISOString() ?? null,
    pendingApprovalCount,
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

export function serializeCockpitPlan(p: Plan): CockpitPlanClient {
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
    phase: r.phase ?? null,
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
    planId: w.planId,
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
