import { z } from "zod/v4";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { metrics, METRIC_TYPES, type MetricType } from "@/db/schema/metric";
import { projects, type Project } from "@/db/schema/project";
import { getActionContext } from "@/lib/auth/context";
import { computeProjectDora, type DoraMetric as DoraComposeMetric } from "@/operations/dora/dora-compose";

const metricSchema = z.object({
  projectId: z.string().optional().nullable(),
  type: z.enum(METRIC_TYPES),
  value: z.number(),
  unit: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  recordedAt: z.date().optional(),
});

export async function recordMetric(input: z.infer<typeof metricSchema>) {
  const ctx = await getActionContext();
  const validated = metricSchema.parse(input);
  const [row] = await db
    .insert(metrics)
    .values({
      organizationId: ctx.organizationId,
      projectId: validated.projectId ?? null,
      type: validated.type,
      value: validated.value,
      unit: validated.unit,
      metadata: validated.metadata,
      recordedAt: validated.recordedAt ?? new Date(),
    })
    .returning({ id: metrics.id });
  return row.id;
}

export async function listMetrics(opts: {
  projectId?: string;
  type?: MetricType;
  since?: Date;
  limit?: number;
}) {
  const ctx = await getActionContext();
  const conditions = [eq(metrics.organizationId, ctx.organizationId)];
  if (opts.projectId) conditions.push(eq(metrics.projectId, opts.projectId));
  if (opts.type) conditions.push(eq(metrics.type, opts.type));
  if (opts.since) conditions.push(gte(metrics.recordedAt, opts.since));

  return db.query.metrics.findMany({
    where: and(...conditions),
    orderBy: [desc(metrics.recordedAt)],
    limit: opts.limit ?? 200,
  });
}

/**
 * Portfolio DORA data, composed from real metrics where available and a
 * sample-data overlay for the v1 demo fixture. Returns one entry per
 * project plus the four portfolio aggregates over the chosen window.
 *
 * TODO(metrics-backfill): drop the fixture overlay once the metrics
 * pipeline produces backfilled rows for the demo seed.
 */

export type DoraMetric = "lead_time" | "deployment_frequency" | "change_failure_rate" | "mttr";

export interface DoraCell {
  value: number | null;
  unit: string;
  sparkline: number[];
  direction: "up" | "down" | "flat";
  wowDelta: number | null;
}

export interface DoraProjectColumn {
  id: string;
  slug: string;
  name: string;
  shortKey: string;
  cells: Record<DoraMetric, DoraCell | null>;
}

export interface DoraAggregate {
  metric: DoraMetric;
  label: string;
  unit: string;
  value: number;
  wowDelta: number;
  /** Improvement-tone — positive deltas may be good (deploy freq up) or bad (CFR up). */
  tone: "success" | "danger" | "neutral";
  sparkline: number[];
}

export interface AttributionFinding {
  metric: DoraMetric;
  projectName: string;
  projectId: string;
  /** Skill that contributed, if attributable. */
  skillName: string | null;
  skillSlug: string | null;
  actionsCount: number;
  /** Specific deploys / PRs / rollbacks attributed. */
  timeline: Array<{ when: string; what: string; link: string | null }>;
  skillState: {
    currentLevel: "OBSERVE" | "PROPOSE" | "MERGE" | "LEAD";
    levelChangedAt: string | null;
  } | null;
}

export interface PortfolioMetricsData {
  windowDays: number;
  refreshedAt: string;
  aggregates: DoraAggregate[];
  columns: DoraProjectColumn[];
  attribution: AttributionFinding | null;
}

const METRIC_LABEL: Record<DoraMetric, string> = {
  lead_time: "Lead time",
  deployment_frequency: "Deploy freq",
  change_failure_rate: "Change failure",
  mttr: "MTTR",
};

const METRIC_UNIT: Record<DoraMetric, string> = {
  lead_time: "d",
  deployment_frequency: "/wk",
  change_failure_rate: "%",
  mttr: "h",
};

function deriveShortKey(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 3) || "PRJ"
  );
}

export async function getPortfolioMetrics(windowDays = 30): Promise<PortfolioMetricsData> {
  const ctx = await getActionContext();
  const projectRows: Project[] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.organizationId, ctx.organizationId), eq(projects.status, "active")))
    .orderBy(projects.createdAt);

  // Real per-project DORA from the metrics table. Empty cells stay null —
  // the panel renders an empty-state for unseeded orgs.
  const doraResults = await Promise.all(
    projectRows.map((p) => computeProjectDora(p.id, windowDays)),
  );

  const columns: DoraProjectColumn[] = projectRows.map((p, i) => {
    const real = doraResults[i];
    const cells: DoraProjectColumn["cells"] = {
      lead_time: real.cells.lead_time ?? null,
      deployment_frequency: real.cells.deployment_frequency ?? null,
      change_failure_rate: real.cells.change_failure_rate ?? null,
      mttr: real.cells.mttr ?? null,
    };
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      shortKey: deriveShortKey(p.name),
      cells,
    };
  });

  return {
    windowDays,
    refreshedAt: new Date().toISOString(),
    aggregates: aggregateFromColumns(columns, windowDays),
    columns,
    attribution: null,
  };
}

const METRIC_BETTER_LOWER: Record<DoraMetric, boolean> = {
  lead_time: true,
  deployment_frequency: false,
  change_failure_rate: true,
  mttr: true,
};

function aggregateFromColumns(columns: DoraProjectColumn[], windowDays: number): DoraAggregate[] {
  const metricsList: DoraMetric[] = ["lead_time", "deployment_frequency", "change_failure_rate", "mttr"];
  const aggs: DoraAggregate[] = [];
  for (const m of metricsList) {
    const cells = columns.map((c) => c.cells[m]).filter((c): c is NonNullable<typeof c> => c !== null);
    if (cells.length === 0) {
      aggs.push({
        metric: m,
        label: METRIC_LABEL[m],
        unit: METRIC_UNIT[m],
        value: 0,
        wowDelta: 0,
        tone: "neutral",
        sparkline: new Array(Math.min(windowDays, 14)).fill(0),
      });
      continue;
    }
    const value =
      cells.reduce((acc, c) => acc + (c.value ?? 0), 0) /
      Math.max(1, cells.filter((c) => c.value !== null).length);
    const wow =
      cells.reduce((acc, c) => acc + (c.wowDelta ?? 0), 0) /
      Math.max(1, cells.filter((c) => c.wowDelta !== null).length);
    // Average sparklines element-wise.
    const sparkLen = Math.max(...cells.map((c) => c.sparkline.length));
    const spark = new Array(sparkLen).fill(0);
    for (let i = 0; i < sparkLen; i++) {
      const vals = cells.map((c) => c.sparkline[i]).filter((v): v is number => v !== undefined);
      spark[i] = vals.length === 0 ? 0 : vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    const tone: DoraAggregate["tone"] =
      wow === 0
        ? "neutral"
        : METRIC_BETTER_LOWER[m]
          ? wow > 0
            ? "danger"
            : "success"
          : wow > 0
            ? "success"
            : "danger";
    aggs.push({
      metric: m,
      label: METRIC_LABEL[m],
      unit: METRIC_UNIT[m],
      value: Math.round(value * 10) / 10,
      wowDelta: Math.round(wow * 10) / 10,
      tone,
      sparkline: spark,
    });
  }
  return aggs;
}
