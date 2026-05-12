import { z } from "zod/v4";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { metrics, METRIC_TYPES, type MetricType } from "@/db/schema/metric";
import { projects, type Project } from "@/db/schema/project";
import { getActionContext } from "@/lib/auth/context";

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
    currentLevel: "INTERN" | "JUNIOR" | "SENIOR" | "PRINCIPAL";
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

// Per-project demo overlay — keep in sync with docs/ux/sample-data.md.
type FixtureCell = { value: number | null; sparkline: number[]; direction: DoraCell["direction"]; wowDelta: number | null };
const PROJECT_FIXTURES: Record<string, Partial<Record<DoraMetric, FixtureCell>>> = {
  "internal-payments-api": {
    lead_time: { value: 3.4, sparkline: [4, 4, 3.8, 3.5, 3.4], direction: "down", wowDelta: -0.4 },
    deployment_frequency: { value: 6.2, sparkline: [4, 5, 5, 6, 6.2], direction: "up", wowDelta: 0.6 },
    change_failure_rate: { value: 8, sparkline: [11, 10, 9, 9, 8], direction: "down", wowDelta: -1 },
    mttr: { value: 1.8, sparkline: [2.5, 2.2, 2.0, 1.9, 1.8], direction: "down", wowDelta: -0.1 },
  },
  "auth-service-migration": {
    lead_time: { value: 5.7, sparkline: [4.5, 4.8, 5.0, 5.4, 5.7], direction: "up", wowDelta: 0.6 },
    deployment_frequency: { value: 4.8, sparkline: [6, 5.5, 5, 4.8, 4.8], direction: "down", wowDelta: -0.4 },
    change_failure_rate: { value: 18, sparkline: [8, 10, 12, 15, 18], direction: "up", wowDelta: 3 },
    mttr: { value: 4.2, sparkline: [2, 2.5, 3, 3.5, 4.2], direction: "up", wowDelta: 0.7 },
  },
  "data-warehouse-v2": {},
  "kafka-pipeline-modernization": {},
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

function aggregateFixture(window: number): {
  aggregates: DoraAggregate[];
  attribution: AttributionFinding | null;
} {
  // Sample-data portfolio aggregates (90d window in source — we scale labels
  // by `window` but values are stub for v1).
  const aggregates: DoraAggregate[] = [
    {
      metric: "lead_time",
      label: METRIC_LABEL.lead_time,
      unit: METRIC_UNIT.lead_time,
      value: 4.8,
      wowDelta: 0.6,
      tone: "danger",
      sparkline: [4.2, 4.3, 4.4, 4.6, 4.8],
    },
    {
      metric: "deployment_frequency",
      label: METRIC_LABEL.deployment_frequency,
      unit: METRIC_UNIT.deployment_frequency,
      value: 4.2,
      wowDelta: 0,
      tone: "neutral",
      sparkline: [4.0, 4.1, 4.2, 4.2, 4.2],
    },
    {
      metric: "change_failure_rate",
      label: METRIC_LABEL.change_failure_rate,
      unit: METRIC_UNIT.change_failure_rate,
      value: 11,
      wowDelta: 3,
      tone: "danger",
      sparkline: [8, 9, 9, 10, 11],
    },
    {
      metric: "mttr",
      label: METRIC_LABEL.mttr,
      unit: METRIC_UNIT.mttr,
      value: 2.3,
      wowDelta: 0,
      tone: "neutral",
      sparkline: [2.3, 2.2, 2.3, 2.4, 2.3],
    },
  ];

  // Heuristic attribution for the demo regression — auth-service-migration's
  // CFR went 8% → 18% in 14d, correlated with 3 auto-merges by
  // schema-migration-reviewer. Marked TODO so a proper causal model can
  // replace this without UI changes.
  // TODO(causal-model): swap heuristic for statistical attribution once
  // skill_outcomes + metrics carry enough signal.
  const attribution: AttributionFinding | null =
    window <= 90
      ? {
          metric: "change_failure_rate",
          projectName: "Auth Service Migration",
          projectId: "proj_auth",
          skillName: "schema-migration-reviewer",
          skillSlug: "schema-migration-reviewer",
          actionsCount: 3,
          timeline: [
            {
              when: "2026-04-28",
              what: "Auto-merge: PR #438 session-cookie-set schema",
              link: null,
            },
            {
              when: "2026-05-02",
              what: "Auto-merge: PR #441 add issuer column (nullable)",
              link: null,
            },
            {
              when: "2026-05-09",
              what: "Auto-merge: PR #447 backfill issuer (NOT NULL)",
              link: null,
            },
            {
              when: "2026-05-10",
              what: "Production incident: session validation 500s",
              link: null,
            },
          ],
          skillState: {
            currentLevel: "JUNIOR" as const,
            levelChangedAt: "2026-05-10",
          },
        }
      : null;

  return { aggregates, attribution };
}

export async function getPortfolioMetrics(windowDays = 30): Promise<PortfolioMetricsData> {
  const ctx = await getActionContext();
  const projectRows: Project[] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.organizationId, ctx.organizationId), eq(projects.status, "active")))
    .orderBy(projects.createdAt);

  const { aggregates, attribution } = aggregateFixture(windowDays);

  const columns: DoraProjectColumn[] = projectRows.map((p) => {
    const fixture = PROJECT_FIXTURES[p.slug] ?? {};
    const cells: DoraProjectColumn["cells"] = {
      lead_time: null,
      deployment_frequency: null,
      change_failure_rate: null,
      mttr: null,
    };
    for (const m of ["lead_time", "deployment_frequency", "change_failure_rate", "mttr"] as DoraMetric[]) {
      const f = fixture[m];
      if (!f) continue;
      cells[m] = {
        value: f.value,
        unit: METRIC_UNIT[m],
        sparkline: f.sparkline,
        direction: f.direction,
        wowDelta: f.wowDelta,
      };
    }
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
    aggregates,
    columns,
    attribution,
  };
}
