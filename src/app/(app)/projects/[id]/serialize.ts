import type { AdapterBinding } from "@/db/schema/adapter-binding";
// AdapterBinding currently has no last-sync column; we surface externalKey
// instead. Sync history will be added when integrations expose it.
import type { Deployment, DeploymentStatus } from "@/db/schema/deployment";
import type { PhaseGate } from "@/db/schema/phase-gate";
import type { Plan } from "@/db/schema/plan";
import type { Project, ProjectPhase, ProjectStatus } from "@/db/schema/project";
import type { Rule, RuleSeverity } from "@/db/schema/rule";
import type { Skill } from "@/db/schema/skill";
import type { WorkItem, WorkItemKind, WorkItemSource } from "@/db/schema/work-item";
import type { PhaseGuidance } from "@/domain/phases";
import type {
  PolicyMatrixCell,
  ProjectOutcomeRow,
} from "@/operations/project-trust";

export interface CockpitProjectClient {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phase: ProjectPhase;
  status: ProjectStatus;
  repoUrl: string | null;
  jiraProjectKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CockpitGateClient {
  id: string;
  name: string;
  type: string;
  status: "pending" | "passed" | "failed" | "skipped";
  unmetCriterion: string | null;
  assigneeName: string | null;
  ageLabel: string | null;
  lastGreenAt: string | null;
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

export interface CockpitClient {
  project: CockpitProjectClient;
  nextPhase: ProjectPhase | null;
  canAdvance: boolean;
  blockedReason: string | null;
  guidance: PhaseGuidance;
  gates: CockpitGateClient[];
  gatesAllPassed: boolean;
  /** Gates grouped by phase — used by the Phases tab timeline. */
  gatesByPhase: CockpitGatesByPhase[];
  bindings: CockpitBindingClient[];
  plans: CockpitPlanClient[];
  workItems: CockpitWorkItemClient[];
  deployments: CockpitDeploymentClient[];
  rules: CockpitRuleClient[];
  skills: CockpitSkillClient[];
  apiKey: {
    prefix: string;
    /** Only present when newly minted in this request. */
    plaintext: string | null;
    isNew: boolean;
  };
  /**
   * Per-project trust surface — recent skill outcomes + active autonomy
   * policy matrix. Closes UI-audit P1.5 + P1.7.
   */
  trust: {
    outcomes: ProjectOutcomeRow[];
    policy: PolicyMatrixCell[];
  };
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
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function serializeCockpitGate(g: PhaseGate): CockpitGateClient {
  return {
    id: g.id,
    name: g.name,
    type: g.type,
    status: g.status,
    unmetCriterion: g.unmetCriterion ?? null,
    assigneeName: g.assigneeName ?? null,
    ageLabel: formatAge(g.lastChangedAt),
    lastGreenAt: g.lastGreenAt?.toISOString() ?? null,
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
