import type { PlanArtifact, PlanKind, PlanStatus } from "@/db/schema/plan/plan-artifact";
import type { PlanRelationshipKind } from "@/db/schema/plan/plan-relationship";
import type { Project } from "@/db/schema/project";

export type PlanRelationshipRowClient = {
  fromPlanArtifactId: string;
  toPlanArtifactId: string;
  kind: PlanRelationshipKind;
};

export type PlanRowClient = {
  id: string;
  title: string;
  summary: string | null;
  kind: PlanKind;
  kindLabel: string;
  status: PlanStatus;
  statusLabel: string;
  statusTone: "neutral" | "info" | "success" | "danger" | "muted";
  priority: string | null;
  projectId: string;
  projectName: string;
  projectSlug: string;
  externalRef: string | null;
  updatedAtIso: string;
  updatedAtLabel: string;
  assigneeName: string | null;
  /** True when at least one pending governance approval record targets this plan.
   * Drives the "Needs approval" filter chip + per-row affordance. */
  needsApproval: boolean;
};

export type PlansPageClient = {
  rows: PlanRowClient[];
  /** All relationships (any kind) touching any plan in `rows`. Tree view uses
   * `parent_of`; future Graph view will use the rest. */
  relationships: PlanRelationshipRowClient[];
  /** When the page is project-scoped, the project id. Used by ViewToggle to
   * pick Tree as the default view. */
  projectId: string | null;
  counts: {
    total: number;
    byStatus: Record<PlanStatus, number>;
    byKind: Record<PlanKind, number>;
    needsApproval: number;
  };
};

const KIND_LABEL: Record<PlanKind, string> = {
  epic: "Epic",
  feature: "Feature",
  story: "Story",
  spec: "Spec",
  adr: "ADR",
  test_plan: "Test plan",
  release_plan: "Release",
  risk_register: "Risk register",
  incident: "Incident",
};

const STATUS_LABEL: Record<PlanStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  in_progress: "In progress",
  completed: "Completed",
  rejected: "Rejected",
  changes_requested: "Changes requested",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<PlanStatus, PlanRowClient["statusTone"]> = {
  draft: "muted",
  in_review: "info",
  approved: "success",
  in_progress: "neutral",
  completed: "success",
  rejected: "danger",
  changes_requested: "info",
  cancelled: "muted",
};

function formatRelative(date: Date): string {
  const ms = Date.now() - date.getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function serializePlanRow(
  plan: PlanArtifact & { project?: Project | null },
  opts: { needsApproval?: boolean } = {},
): PlanRowClient {
  const proj = plan.project;
  return {
    id: plan.id,
    title: plan.title,
    summary: plan.summary ?? null,
    kind: plan.kind,
    kindLabel: KIND_LABEL[plan.kind] ?? plan.kind,
    status: plan.status,
    statusLabel: STATUS_LABEL[plan.status] ?? plan.status,
    statusTone: STATUS_TONE[plan.status] ?? "neutral",
    priority: plan.priority ?? null,
    projectId: plan.projectId,
    projectName: proj?.name ?? plan.projectId.slice(0, 6),
    projectSlug: proj?.slug ?? "",
    externalRef: plan.externalRef ?? null,
    updatedAtIso: plan.updatedAt.toISOString(),
    updatedAtLabel: formatRelative(plan.updatedAt),
    assigneeName: plan.assigneeName ?? null,
    needsApproval: opts.needsApproval ?? false,
  };
}
