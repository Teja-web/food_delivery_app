import type { Metric } from "@/db/schema/metric";
import type { MetricType } from "@/db/schema/metric";

export interface MetricPoint {
  t: number;
  v: number;
}

export interface MetricSeries {
  type: MetricType;
  unit: string | null;
  points: MetricPoint[];
  latest: number | null;
  count: number;
}

export function serializeSeries(type: MetricType, rows: Metric[]): MetricSeries {
  // listMetrics returns desc; flip to ascending for charting.
  const sorted = [...rows].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  return {
    type,
    unit: rows[0]?.unit ?? null,
    points: sorted.map((r) => ({ t: r.recordedAt.getTime(), v: r.value })),
    latest: sorted.length ? sorted[sorted.length - 1].value : null,
    count: rows.length,
  };
}
