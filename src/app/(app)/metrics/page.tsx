import { listMetrics } from "@/actions/metrics";
import { METRIC_TYPES, type MetricType } from "@/db/schema/metric";
import { serializeSeries, type MetricSeries } from "./serialize";
import { Sparkline } from "./Sparkline";

const TITLES: Record<MetricType, string> = {
  lead_time: "Lead time",
  deployment_frequency: "Deployment frequency",
  mttr: "Mean time to recovery",
  change_failure_rate: "Change failure rate",
  cycle_time: "Cycle time",
  pr_merge_time: "PR merge time",
  build_duration: "Build duration",
  test_coverage: "Test coverage",
};

const SINCE_DAYS = 30;

export default async function MetricsPage() {
  const since = new Date(Date.now() - SINCE_DAYS * 86_400_000);

  const series: MetricSeries[] = await Promise.all(
    METRIC_TYPES.map(async (type) => {
      const rows = await listMetrics({ type, since, limit: 500 });
      return serializeSeries(type, rows);
    }),
  );

  const total = series.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Metrics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Last {SINCE_DAYS} days. {total} data points across {series.filter((s) => s.count > 0).length} metric types.
        </p>
      </div>

      {total === 0 ? (
        <div className="rounded border bg-muted/30 p-8 text-sm text-muted-foreground">
          No metrics yet. Deployments and resolved work items emit metrics automatically.
          You can also POST to <code>/api/v1/metrics</code> from CI.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {series.map((s) => (
            <div key={s.type} className="rounded border p-4">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-sm font-medium">{TITLES[s.type]}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.count} point{s.count === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold tabular-nums">
                    {s.latest === null ? "—" : formatValue(s.latest)}
                  </div>
                  {s.unit ? <div className="text-xs text-muted-foreground">{s.unit}</div> : null}
                </div>
              </div>
              <div className="mt-3">
                <Sparkline points={s.points} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatValue(v: number): string {
  if (Number.isInteger(v)) return v.toString();
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}
