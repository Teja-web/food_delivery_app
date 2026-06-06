/**
 * Portfolio operation — composes the H1 portfolio view data.
 *
 * Mixes real DB data (projects, gates, approval counts) with v1 placeholder
 * values for sparklines, CFR, lead time, deploys, and autonomy events. The
 * placeholders are keyed by project slug so that once metrics +
 * skill-autonomy pipelines populate, the replacement is mechanical — drop
 * the stub and read from `metrics`/`skill_outcomes`.
 */

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { governanceRecords, type GovernanceRecordStatus } from "@/db/schema/governance/records";
import { projects, type Project } from "@/db/schema/project";
import { getActionContext } from "@/lib/auth/context";
import { computePortfolioRollup, computeProjectDora } from "@/operations/dora/dora-compose";
import { getProjectAutonomyAggregate } from "@/operations/skill/skill-autonomy";

export type ProjectHealth = "healthy" | "warning" | "danger" | "neutral";
export type TrendDir = "up" | "down" | "flat";

export type PortfolioGate = {
  name: string;
  status: GovernanceRecordStatus;
};

export type AutonomyPosture = {
  observe: number;
  propose: number;
  merge: number;
  lead: number;
  total: number;
  incidentsLast7d: number;
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
  autonomyPosture: AutonomyPosture;
};

export type PortfolioRollup = {
  openApprovals: number;
  deploysThisWeek: number;
  autonomyEvents: { promotions: number; demotions: number };
  portfolioCFR: { value: number | null; wowDeltaPoints: number };
};

export type PortfolioData = {
  rollup: PortfolioRollup;
  rows: PortfolioProjectRow[];
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

/**
 * Per-project gate-kind governance records plus how many are currently passed.
 * Gate sub-kind / display name is derived from `details.type` when present,
 * falling back to "gate".
 */
async function fetchGatesForProjects(
  organizationId: string,
  projectIds: string[],
): Promise<Map<string, { passed: number; total: number; items: PortfolioGate[] }>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({
      projectId: governanceRecords.projectId,
      details: governanceRecords.details,
      status: governanceRecords.status,
    })
    .from(governanceRecords)
    .where(
      and(
        eq(governanceRecords.organizationId, organizationId),
        eq(governanceRecords.kind, "gate"),
        inArray(governanceRecords.projectId, projectIds),
      ),
    );

  const byProject = new Map<string, { passed: number; total: number; items: PortfolioGate[] }>();
  for (const r of rows) {
    const slot = byProject.get(r.projectId) ?? { passed: 0, total: 0, items: [] };
    const name = (r.details as { type?: string } | null)?.type ?? "gate";
    slot.items.push({ name, status: r.status });
    slot.total += 1;
    if (r.status === "passed" || r.status === "skipped") slot.passed += 1;
    byProject.set(r.projectId, slot);
  }
  return byProject;
}

async function fetchOpenApprovalCounts(
  organizationId: string,
  projectIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (projectIds.length === 0) return map;
  const rows = await db
    .select({
      projectId: governanceRecords.projectId,
      n: sql<number>`count(*)::int`,
    })
    .from(governanceRecords)
    .where(
      and(
        eq(governanceRecords.organizationId, organizationId),
        eq(governanceRecords.kind, "approval"),
        eq(governanceRecords.status, "pending"),
        inArray(governanceRecords.projectId, projectIds),
      ),
    )
    .groupBy(governanceRecords.projectId);
  for (const r of rows) {
    if (r.projectId) map.set(r.projectId, r.n);
  }
  for (const id of projectIds) if (!map.has(id)) map.set(id, 0);
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
  const [gateByProject, openByProject, doraByProject, realRollup, autonomyByProject] =
    await Promise.all([
      fetchGatesForProjects(ctx.organizationId, projectIds),
      fetchOpenApprovalCounts(ctx.organizationId, projectIds),
      Promise.all(projectIds.map((id) => computeProjectDora(id, 30))),
      computePortfolioRollup(ctx.organizationId, 7),
      Promise.all(
        projectIds.map((id) => getProjectAutonomyAggregate(id, ctx.organizationId)),
      ),
    ]);
  const doraIndex = new Map(projectIds.map((id, i) => [id, doraByProject[i]]));
  const autonomyIndex = new Map(
    projectIds.map((id, i) => [id, autonomyByProject[i]]),
  );

  const now = Date.now();
  const rows: PortfolioProjectRow[] = projectRows.map((p) => {
    const gates = gateByProject.get(p.id) ?? { passed: 0, total: 0, items: [] };
    const staleDays = Math.floor((now - p.updatedAt.getTime()) / (24 * 60 * 60 * 1000));
    const dora = doraIndex.get(p.id);

    const leadTimeDays = dora?.cells.lead_time?.value ?? null;
    const deployCell = dora?.cells.deployment_frequency;
    // deployment_frequency is /wk; portfolio shows 30d total.
    const deploys30d = deployCell?.value != null ? Math.round((deployCell.value / 7) * 30) : null;
    const cfrCell = dora?.cells.change_failure_rate;
    const cfrPct = cfrCell?.value ?? null;
    const cfrFraction = cfrPct !== null ? cfrPct / 100 : null;
    const cfrSparkline = cfrCell?.sparkline ?? null;
    const cfrDirection = cfrCell?.direction ?? null;
    const cfrWowPoints = cfrCell?.wowDelta ?? null;
    const hasRegression = cfrWowPoints !== null && cfrWowPoints >= 3;

    return {
      project: p,
      shortKey: deriveShortKey(p.name),
      health: deriveHealth(p, cfrFraction),
      hasRegression,
      isStale: staleDays >= 30,
      staleDays,
      gates,
      openApprovals: openByProject.get(p.id) ?? 0,
      leadTimeDays,
      deploys30d,
      cfr30d: cfrFraction,
      cfrSparkline,
      cfrTrendDirection: cfrDirection,
      cfrWowDeltaPoints: cfrWowPoints,
      autonomyPosture: autonomyIndex.get(p.id) ?? {
        observe: 0,
        propose: 0,
        merge: 0,
        lead: 0,
        total: 0,
        incidentsLast7d: 0,
      },
    };
  });

  const rollup: PortfolioRollup = {
    openApprovals: rows.reduce((acc, r) => acc + r.openApprovals, 0),
    deploysThisWeek: realRollup.deploysInWindow,
    autonomyEvents: {
      promotions: realRollup.autonomyPromotions,
      demotions: realRollup.autonomyDemotions,
    },
    portfolioCFR:
      realRollup.cfrPct !== null
        ? { value: realRollup.cfrPct / 100, wowDeltaPoints: realRollup.cfrWowDeltaPoints ?? 0 }
        : { value: null, wowDeltaPoints: 0 },
  };

  return { rollup, rows };
}
