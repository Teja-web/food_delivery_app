/**
 * Portfolio operation — composes the H1 portfolio view data.
 *
 * Mixes real DB data (projects, gates, approval counts) with v1 stubs
 * (sparklines, CFR, lead time, deploys, autonomy events) sourced from
 * `docs/ux/sample-data.md`. The stubs are keyed by project slug so that
 * once metrics + skill-autonomy pipelines populate, replacements are
 * mechanical — drop the fixture and read from `metrics`/`skill_outcomes`.
 */

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { approvals } from "@/db/schema/approval";
import { phaseGates, type GateStatus } from "@/db/schema/phase-gate";
import { projects, type Project, type ProjectPhase } from "@/db/schema/project";
import { getActionContext } from "@/lib/auth/context";

export type ProjectHealth = "healthy" | "warning" | "danger" | "neutral";
export type TrendDir = "up" | "down" | "flat";

export type PortfolioGate = {
  name: string;
  status: GateStatus;
};

export type PortfolioProjectRow = {
  project: Project;
  shortKey: string;
  health: ProjectHealth;
  hasRegression: boolean;
  isStale: boolean;
  staleDays: number;
  gates: { passed: number; total: number; items: PortfolioGate[] };
  openApprovals: number;
  leadTimeDays: number | null;
  deploys30d: number | null;
  cfr30d: number | null;
  cfrSparkline: number[] | null;
  cfrTrendDirection: TrendDir | null;
  cfrWowDeltaPoints: number | null;
};

export type PortfolioRollup = {
  openApprovals: number;
  deploysThisWeek: number;
  autonomyEvents: { promotions: number; demotions: number };
  portfolioCFR: { value: number; wowDeltaPoints: number };
};

export type PortfolioData = {
  rollup: PortfolioRollup;
  rows: PortfolioProjectRow[];
};

/**
 * Per-project fixture overlay — sourced from docs/ux/sample-data.md.
 * Replace with reads from `metrics` + `skill_outcomes` once those pipelines
 * are populated. TODO(metrics-backfill): drop in favor of getMetricsForProject().
 */
const PROJECT_FIXTURES: Record<
  string,
  Pick<
    PortfolioProjectRow,
    | "leadTimeDays"
    | "deploys30d"
    | "cfr30d"
    | "cfrSparkline"
    | "cfrTrendDirection"
    | "cfrWowDeltaPoints"
    | "hasRegression"
    | "health"
    | "shortKey"
  >
> = {
  "internal-payments-api": {
    shortKey: "IPA",
    health: "healthy",
    hasRegression: false,
    leadTimeDays: 3.4,
    deploys30d: 6.2,
    cfr30d: 0.08,
    cfrSparkline: [12, 11, 10, 9, 10, 9, 8, 8, 9, 8, 8, 8],
    cfrTrendDirection: "down",
    cfrWowDeltaPoints: -1,
  },
  "data-warehouse-v2": {
    shortKey: "DW2",
    health: "healthy",
    hasRegression: false,
    leadTimeDays: null,
    deploys30d: null,
    cfr30d: null,
    cfrSparkline: null,
    cfrTrendDirection: null,
    cfrWowDeltaPoints: null,
  },
  "auth-service-migration": {
    shortKey: "ASM",
    health: "danger",
    hasRegression: true,
    leadTimeDays: 5.7,
    deploys30d: 4.8,
    cfr30d: 0.18,
    cfrSparkline: [7, 8, 9, 9, 11, 12, 13, 14, 16, 17, 17, 18],
    cfrTrendDirection: "up",
    cfrWowDeltaPoints: 3,
  },
  "kafka-pipeline-modernization": {
    shortKey: "KAF",
    health: "healthy",
    hasRegression: false,
    leadTimeDays: null,
    deploys30d: null,
    cfr30d: null,
    cfrSparkline: null,
    cfrTrendDirection: null,
    cfrWowDeltaPoints: null,
  },
};

/** Generic fallback shortKey: first letters of name words, max 3 chars. */
function deriveShortKey(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 3);
  return initials || "PRJ";
}

function deriveHealth(project: Project, cfr: number | null): ProjectHealth {
  if (cfr !== null) {
    if (cfr >= 0.15) return "danger";
    if (cfr >= 0.1) return "warning";
    return "healthy";
  }
  if (project.status === "archived") return "neutral";
  return "healthy";
}

/** Phase-expected gates plus how many are currently passed. */
async function fetchGatesForProjects(
  organizationId: string,
  projectIds: string[],
): Promise<Map<string, { passed: number; total: number; items: PortfolioGate[] }>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({
      projectId: phaseGates.projectId,
      phase: phaseGates.phase,
      name: phaseGates.name,
      status: phaseGates.status,
    })
    .from(phaseGates)
    .where(
      and(
        eq(phaseGates.organizationId, organizationId),
        inArray(phaseGates.projectId, projectIds),
      ),
    );

  const byProject = new Map<
    string,
    { passed: number; total: number; items: PortfolioGate[]; phase: ProjectPhase | null }
  >();
  for (const r of rows) {
    const slot = byProject.get(r.projectId) ?? { passed: 0, total: 0, items: [], phase: null };
    slot.items.push({ name: r.name, status: r.status });
    slot.total += 1;
    if (r.status === "passed" || r.status === "skipped") slot.passed += 1;
    byProject.set(r.projectId, slot);
  }
  const out = new Map<string, { passed: number; total: number; items: PortfolioGate[] }>();
  for (const [projectId, slot] of byProject) {
    out.set(projectId, { passed: slot.passed, total: slot.total, items: slot.items });
  }
  return out;
}

async function fetchOpenApprovalCounts(
  organizationId: string,
  projectIds: string[],
): Promise<Map<string, number>> {
  if (projectIds.length === 0) return new Map();
  // approvals don't reference project directly — they're polymorphic. For v1
  // we attribute open approvals via the `phase` column when its entityType is
  // phase_gate, or via the entity table for plans/work_items. The cheapest
  // signal we can produce now is: count of pending approvals whose
  // requesterNote / phase mentions the project — fall back to portfolio-level.
  // Pragmatic v1: count all pending approvals and return the same total per
  // project. This will be replaced once approvals carry a projectId column.
  // TODO(approvals-projectid): wire real per-project counts when the schema
  // gains the projectId foreign key.
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(approvals)
    .where(and(eq(approvals.organizationId, organizationId), eq(approvals.status, "pending")));
  const total = row?.n ?? 0;
  const map = new Map<string, number>();
  const perProject = projectIds.length > 0 ? Math.floor(total / projectIds.length) : 0;
  for (const id of projectIds) map.set(id, perProject);
  return map;
}

/**
 * Fetch the H1 portfolio view: list of projects, decorated with health,
 * gates, open approvals, and DORA stubs.
 */
export async function getPortfolioData(): Promise<PortfolioData> {
  const ctx = await getActionContext();

  const projectRows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.organizationId, ctx.organizationId), eq(projects.status, "active")))
    .orderBy(projects.createdAt);

  const projectIds = projectRows.map((p) => p.id);
  const [gateByProject, openByProject] = await Promise.all([
    fetchGatesForProjects(ctx.organizationId, projectIds),
    fetchOpenApprovalCounts(ctx.organizationId, projectIds),
  ]);

  const now = Date.now();
  const rows: PortfolioProjectRow[] = projectRows.map((p) => {
    const fixture = PROJECT_FIXTURES[p.slug];
    const gates = gateByProject.get(p.id) ?? { passed: 0, total: 0, items: [] };
    const cfr = fixture?.cfr30d ?? null;
    const staleDays = Math.floor((now - p.updatedAt.getTime()) / (24 * 60 * 60 * 1000));
    return {
      project: p,
      shortKey: fixture?.shortKey ?? deriveShortKey(p.name),
      health: fixture?.health ?? deriveHealth(p, cfr),
      hasRegression: fixture?.hasRegression ?? false,
      isStale: staleDays >= 30,
      staleDays,
      gates,
      openApprovals: openByProject.get(p.id) ?? 0,
      leadTimeDays: fixture?.leadTimeDays ?? null,
      deploys30d: fixture?.deploys30d ?? null,
      cfr30d: cfr,
      cfrSparkline: fixture?.cfrSparkline ?? null,
      cfrTrendDirection: fixture?.cfrTrendDirection ?? null,
      cfrWowDeltaPoints: fixture?.cfrWowDeltaPoints ?? null,
    };
  });

  // Rollup — TODO(metrics-backfill): replace with sums/averages from `metrics`
  // and `skill_autonomy` once populated. Values match sample-data.md.
  const rollup: PortfolioRollup = {
    openApprovals: rows.reduce((acc, r) => acc + r.openApprovals, 0) || 12,
    deploysThisWeek: 18,
    autonomyEvents: { promotions: 1, demotions: 1 },
    portfolioCFR: { value: 0.11, wowDeltaPoints: 3 },
  };

  return { rollup, rows };
}
