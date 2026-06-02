/**
 * DORA metrics composition — over the `metrics` table.
 *
 * Pure aggregation: takes a window in days, returns lead_time / deploy_freq
 * / change_failure_rate / mttr per project, with sparklines and WoW deltas.
 *
 * Producers writing to `metrics`:
 *   - `recordDeployment` in `src/operations/deployments.ts` — writes a
 *     `deployment_frequency` row (value=1) per successful deploy and a
 *     `change_failure_rate` row (value=1) per failed/rolled_back deploy.
 *   - `computeWorkItemLeadTime` task — writes a `lead_time` row (value=hours)
 *     per terminal work-item transition.
 *   - mttr is not yet written by any pipeline; returns null and the caller
 *     falls back to fixture or "—".
 *
 * Used by both H1 portfolio (`src/operations/portfolio.ts`) and H5 DORA
 * (`src/operations/metrics.ts`). One implementation, two callers.
 */

import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";

import { db } from "@/db/client";
import { metrics, type MetricType } from "@/db/schema/metric";
import { skillAutonomy } from "@/db/schema/skill/skill-autonomy";

const DAY_MS = 24 * 60 * 60 * 1000;

export type DoraMetric =
  | "lead_time"
  | "deployment_frequency"
  | "change_failure_rate"
  | "mttr";

export interface DoraCell {
  value: number | null;
  unit: string;
  sparkline: number[];
  direction: "up" | "down" | "flat";
  wowDelta: number | null;
}

export interface ProjectDora {
  /** True when any of the four metrics has a row in the window. */
  hasData: boolean;
  cells: Record<DoraMetric, DoraCell | null>;
}

export const METRIC_UNIT: Record<DoraMetric, string> = {
  lead_time: "d",
  deployment_frequency: "/wk",
  change_failure_rate: "%",
  mttr: "h",
};

interface RawRow {
  type: MetricType;
  value: number;
  recordedAt: Date;
}

function trendDirection(prev: number | null, curr: number | null, betterLower: boolean): DoraCell["direction"] {
  if (prev === null || curr === null) return "flat";
  if (curr === prev) return "flat";
  const improving = betterLower ? curr < prev : curr > prev;
  return improving ? "up" : "down";
}

// Exported for unit tests.
export const _internals = {
  bucketByDay: (rows: RawRow[], type: MetricType, windowDays: number, now: Date) =>
    bucketByDay(rows, type, windowDays, now),
  meanByDay: (rows: RawRow[], type: MetricType, windowDays: number, now: Date) =>
    meanByDay(rows, type, windowDays, now),
  halfWindowDelta: (buckets: number[], aggregator: "sum" | "mean") =>
    halfWindowDelta(buckets, aggregator),
  trendDirection: (prev: number | null, curr: number | null, betterLower: boolean) =>
    trendDirection(prev, curr, betterLower),
};

/**
 * Bucket index convention: `idx = (windowDays - 1) - floor((now - t)/DAY)`.
 * So today maps to `windowDays - 1`, one-day-ago to `windowDays - 2`, etc.
 * Rows strictly older than `windowDays` days are excluded (idx < 0).
 */
function bucketIndex(recordedAt: Date, windowDays: number, now: Date): number {
  const daysAgo = Math.floor((now.getTime() - recordedAt.getTime()) / DAY_MS);
  return windowDays - 1 - daysAgo;
}

function bucketByDay(rows: RawRow[], type: MetricType, windowDays: number, now: Date): number[] {
  const buckets = new Array(windowDays).fill(0);
  for (const r of rows) {
    if (r.type !== type) continue;
    const idx = bucketIndex(r.recordedAt, windowDays, now);
    if (idx < 0 || idx >= windowDays) continue;
    buckets[idx] += r.value;
  }
  return buckets;
}

function meanByDay(rows: RawRow[], type: MetricType, windowDays: number, now: Date): number[] {
  const sums = new Array(windowDays).fill(0);
  const counts = new Array(windowDays).fill(0);
  for (const r of rows) {
    if (r.type !== type) continue;
    const idx = bucketIndex(r.recordedAt, windowDays, now);
    if (idx < 0 || idx >= windowDays) continue;
    sums[idx] += r.value;
    counts[idx] += 1;
  }
  return sums.map((s, i) => (counts[i] === 0 ? 0 : s / counts[i]));
}

function halfWindowDelta(buckets: number[], aggregator: "sum" | "mean"): {
  curr: number | null;
  prev: number | null;
  delta: number | null;
} {
  if (buckets.length < 2) return { curr: null, prev: null, delta: null };
  const half = Math.floor(buckets.length / 2);
  const first = buckets.slice(0, half);
  const second = buckets.slice(half);
  const reduce = (arr: number[]) => {
    if (arr.length === 0) return null;
    if (aggregator === "sum") return arr.reduce((a, b) => a + b, 0);
    const populated = arr.filter((v) => v > 0);
    return populated.length === 0 ? null : populated.reduce((a, b) => a + b, 0) / populated.length;
  };
  const prev = reduce(first);
  const curr = reduce(second);
  const delta = prev !== null && curr !== null ? curr - prev : null;
  return { curr, prev, delta };
}

export async function computeProjectDora(
  projectId: string,
  windowDays = 30,
  now: Date = new Date(),
): Promise<ProjectDora> {
  const since = new Date(now.getTime() - windowDays * DAY_MS);
  const rows = await db
    .select({ type: metrics.type, value: metrics.value, recordedAt: metrics.recordedAt })
    .from(metrics)
    .where(
      and(
        eq(metrics.projectId, projectId),
        inArray(metrics.type, [
          "lead_time",
          "deployment_frequency",
          "change_failure_rate",
          "mttr",
        ]),
        gte(metrics.recordedAt, since),
      ),
    )
    .orderBy(asc(metrics.recordedAt));

  const hasData = rows.length > 0;

  // lead_time — recorded in hours per terminal work item; report mean in days.
  const leadBuckets = meanByDay(rows, "lead_time", windowDays, now);
  const leadDelta = halfWindowDelta(leadBuckets, "mean");
  const leadCurrDays = leadDelta.curr !== null ? leadDelta.curr / 24 : null;
  const leadPrevDays = leadDelta.prev !== null ? leadDelta.prev / 24 : null;
  const leadWowDays = leadCurrDays !== null && leadPrevDays !== null ? leadCurrDays - leadPrevDays : null;
  const leadCell: DoraCell | null = leadCurrDays === null
    ? null
    : {
        value: Math.round(leadCurrDays * 10) / 10,
        unit: METRIC_UNIT.lead_time,
        sparkline: leadBuckets.map((h) => h / 24),
        direction: trendDirection(leadPrevDays, leadCurrDays, /* lower is better */ true),
        wowDelta: leadWowDays === null ? null : Math.round(leadWowDays * 10) / 10,
      };

  // deployment_frequency — count of deploys per day in window. Report
  // per-week rate: (count over window) / (windowDays / 7).
  const deployBuckets = bucketByDay(rows, "deployment_frequency", windowDays, now);
  const deployTotal = deployBuckets.reduce((a, b) => a + b, 0);
  const deployPerWk = windowDays === 0 ? null : (deployTotal / windowDays) * 7;
  const deployDelta = halfWindowDelta(deployBuckets, "sum");
  const deployWowPerWk =
    deployDelta.curr !== null && deployDelta.prev !== null && windowDays > 0
      ? ((deployDelta.curr - deployDelta.prev) / (windowDays / 2)) * 7
      : null;
  const deployCell: DoraCell | null =
    deployTotal === 0
      ? null
      : {
          value: Math.round(deployPerWk! * 10) / 10,
          unit: METRIC_UNIT.deployment_frequency,
          sparkline: deployBuckets,
          direction: trendDirection(
            deployDelta.prev,
            deployDelta.curr,
            /* lower is better */ false,
          ),
          wowDelta: deployWowPerWk === null ? null : Math.round(deployWowPerWk * 10) / 10,
        };

  // change_failure_rate — % of changes that fail. Numerator =
  // count(change_failure_rate rows). Denominator = numerator + deploys.
  const failureBuckets = bucketByDay(rows, "change_failure_rate", windowDays, now);
  const failureTotal = failureBuckets.reduce((a, b) => a + b, 0);
  const totalChanges = deployTotal + failureTotal;
  const cfrPct = totalChanges === 0 ? null : (failureTotal / totalChanges) * 100;
  // Half-window WoW: compare CFR for the two halves of the window.
  const halfIdx = Math.floor(windowDays / 2);
  const firstHalfDeploys = deployBuckets.slice(0, halfIdx).reduce((a, b) => a + b, 0);
  const firstHalfFailures = failureBuckets.slice(0, halfIdx).reduce((a, b) => a + b, 0);
  const secondHalfDeploys = deployBuckets.slice(halfIdx).reduce((a, b) => a + b, 0);
  const secondHalfFailures = failureBuckets.slice(halfIdx).reduce((a, b) => a + b, 0);
  const firstHalfCfr =
    firstHalfDeploys + firstHalfFailures === 0
      ? null
      : (firstHalfFailures / (firstHalfDeploys + firstHalfFailures)) * 100;
  const secondHalfCfr =
    secondHalfDeploys + secondHalfFailures === 0
      ? null
      : (secondHalfFailures / (secondHalfDeploys + secondHalfFailures)) * 100;
  const cfrWow = firstHalfCfr !== null && secondHalfCfr !== null ? secondHalfCfr - firstHalfCfr : null;
  // CFR sparkline: per-day failure rate over total-changes per day.
  const cfrSparkline = deployBuckets.map((d, i) => {
    const f = failureBuckets[i];
    return d + f === 0 ? 0 : (f / (d + f)) * 100;
  });
  const cfrCell: DoraCell | null =
    totalChanges === 0
      ? null
      : {
          value: Math.round(cfrPct! * 10) / 10,
          unit: METRIC_UNIT.change_failure_rate,
          sparkline: cfrSparkline,
          direction: trendDirection(firstHalfCfr, secondHalfCfr, /* lower is better */ true),
          wowDelta: cfrWow === null ? null : Math.round(cfrWow * 10) / 10,
        };

  // mttr — recorded in hours by `recordMttrForSuccess` / `recordMttrForRollback`
  // (see src/operations/mttr.ts). Mean over the window, same shape as lead_time
  // but already in hours so no unit conversion.
  const mttrBuckets = meanByDay(rows, "mttr", windowDays, now);
  const mttrDelta = halfWindowDelta(mttrBuckets, "mean");
  const mttrWow =
    mttrDelta.curr !== null && mttrDelta.prev !== null ? mttrDelta.curr - mttrDelta.prev : null;
  const mttrCell: DoraCell | null = mttrDelta.curr === null
    ? null
    : {
        value: Math.round(mttrDelta.curr * 10) / 10,
        unit: METRIC_UNIT.mttr,
        sparkline: mttrBuckets,
        direction: trendDirection(mttrDelta.prev, mttrDelta.curr, /* lower is better */ true),
        wowDelta: mttrWow === null ? null : Math.round(mttrWow * 10) / 10,
      };

  return {
    hasData,
    cells: {
      lead_time: leadCell,
      deployment_frequency: deployCell,
      change_failure_rate: cfrCell,
      mttr: mttrCell,
    },
  };
}

export interface PortfolioRollupRealtime {
  /** Successful deploys across the org in the trailing N days. Default: 7. */
  deploysInWindow: number;
  /** Promotions in the trailing N days. */
  autonomyPromotions: number;
  /** Demotions in the trailing N days. */
  autonomyDemotions: number;
  /** Org-level CFR over the window — derived from per-project rollup. */
  cfrPct: number | null;
  /** Half-window CFR delta in percentage points. */
  cfrWowDeltaPoints: number | null;
}

export async function computePortfolioRollup(
  organizationId: string,
  windowDays = 7,
  now: Date = new Date(),
): Promise<PortfolioRollupRealtime> {
  const since = new Date(now.getTime() - windowDays * DAY_MS);
  const rows = await db
    .select({ type: metrics.type, recordedAt: metrics.recordedAt })
    .from(metrics)
    .where(
      and(
        eq(metrics.organizationId, organizationId),
        inArray(metrics.type, ["deployment_frequency", "change_failure_rate"]),
        gte(metrics.recordedAt, since),
      ),
    );

  let deploys = 0;
  let failures = 0;
  const halfMs = since.getTime() + (windowDays * DAY_MS) / 2;
  let firstDeploys = 0;
  let firstFailures = 0;
  let secondDeploys = 0;
  let secondFailures = 0;
  for (const r of rows) {
    const inFirst = r.recordedAt.getTime() < halfMs;
    if (r.type === "deployment_frequency") {
      deploys += 1;
      if (inFirst) firstDeploys += 1;
      else secondDeploys += 1;
    } else if (r.type === "change_failure_rate") {
      failures += 1;
      if (inFirst) firstFailures += 1;
      else secondFailures += 1;
    }
  }
  const totalChanges = deploys + failures;
  const cfrPct = totalChanges === 0 ? null : (failures / totalChanges) * 100;
  const firstTotal = firstDeploys + firstFailures;
  const secondTotal = secondDeploys + secondFailures;
  const firstCfr = firstTotal === 0 ? null : (firstFailures / firstTotal) * 100;
  const secondCfr = secondTotal === 0 ? null : (secondFailures / secondTotal) * 100;
  const cfrWow = firstCfr !== null && secondCfr !== null ? Math.round((secondCfr - firstCfr) * 10) / 10 : null;

  // Autonomy events from skill_autonomy.levelSetAt within window. We can't
  // distinguish promotion vs demotion from current state alone; use
  // lastReason as a heuristic ("promoted" / "demoted" strings produced by
  // recomputeSkillAutonomy).
  const autonomyRows = await db
    .select({ reason: skillAutonomy.lastReason, levelSetAt: skillAutonomy.levelSetAt })
    .from(skillAutonomy)
    .where(
      and(eq(skillAutonomy.organizationId, organizationId), gte(skillAutonomy.levelSetAt, since)),
    );
  let promotions = 0;
  let demotions = 0;
  for (const r of autonomyRows) {
    const reason = (r.reason ?? "").toLowerCase();
    if (reason.startsWith("promoted")) promotions += 1;
    else if (reason.startsWith("demoted")) demotions += 1;
  }

  return {
    deploysInWindow: deploys,
    autonomyPromotions: promotions,
    autonomyDemotions: demotions,
    cfrPct: cfrPct === null ? null : Math.round(cfrPct * 10) / 10,
    cfrWowDeltaPoints: cfrWow,
  };
}

void lt; // referenced for future "only completed deploys" filter
