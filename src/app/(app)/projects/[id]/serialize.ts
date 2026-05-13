import type { AdapterBinding } from "@/db/schema/adapter-binding";
// AdapterBinding currently has no last-sync column; we surface externalKey
// instead. Sync history will be added when integrations expose it.
import type { PhaseGate } from "@/db/schema/phase-gate";
import type { Plan } from "@/db/schema/plan";
import type { Project, ProjectPhase, ProjectStatus } from "@/db/schema/project";
import type { Rule, RuleSeverity } from "@/db/schema/rule";
import type { PhaseGuidance } from "@/domain/phases";

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

export interface CockpitClient {
  project: CockpitProjectClient;
  nextPhase: ProjectPhase | null;
  canAdvance: boolean;
  blockedReason: string | null;
  guidance: PhaseGuidance;
  gates: CockpitGateClient[];
  gatesAllPassed: boolean;
  bindings: CockpitBindingClient[];
  plans: CockpitPlanClient[];
  rules: CockpitRuleClient[];
  apiKey: {
    prefix: string;
    /** Only present when newly minted in this request. */
    plaintext: string | null;
    isNew: boolean;
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
