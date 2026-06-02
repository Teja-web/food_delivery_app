"use client";

import { ArrowDownRight, ArrowUpRight, ChevronRight, ExternalLink, Minus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { AutonomyPill } from "@/components/trust/AutonomyPill";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkline } from "@/components/viz/Sparkline";
import { cn } from "@/lib/utils";
import type {
  AttributionFinding,
  DoraAggregate,
  DoraMetric,
  DoraProjectColumn,
  PortfolioMetricsData,
} from "@/operations/dora/metrics";

function formatValue(v: number | null, unit: string): string {
  if (v === null) return "—";
  if (unit === "%") return `${Math.round(v)}%`;
  if (unit === "/wk") return v.toFixed(1);
  if (unit === "h") return `${v.toFixed(1)}h`;
  if (unit === "d") return `${v.toFixed(1)}d`;
  return v.toString();
}

function DeltaBadge({
  delta,
  tone,
  unit,
}: {
  delta: number | null;
  tone: "success" | "danger" | "neutral";
  unit: string;
}) {
  if (delta === null || delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
        <Minus className="h-3 w-3" aria-hidden /> flat
      </span>
    );
  }
  const Icon = delta > 0 ? ArrowUpRight : ArrowDownRight;
  const toneClass =
    tone === "success" ? "text-trend-up" : tone === "danger" ? "text-trend-down" : "text-muted-foreground";
  const value = unit === "%" ? `${delta > 0 ? "+" : ""}${delta}pt` : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}${unit}`;
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono text-[11px] tabular-nums", toneClass)}>
      <Icon className="h-3 w-3" aria-hidden /> {value} WoW
    </span>
  );
}

function AggregateCard({ aggregate }: { aggregate: DoraAggregate }) {
  return (
    <Card className="bg-card/40">
      <CardContent className="space-y-2 pt-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {aggregate.label}
        </div>
        <div className="flex items-baseline justify-between">
          <span className="font-display text-3xl font-bold tabular-nums">
            {formatValue(aggregate.value, aggregate.unit)}
          </span>
          <Sparkline
            points={aggregate.sparkline}
            direction={aggregate.tone === "success" ? "up" : aggregate.tone === "danger" ? "down" : "flat"}
            width={64}
            height={20}
          />
        </div>
        <DeltaBadge delta={aggregate.wowDelta} tone={aggregate.tone} unit={aggregate.unit} />
      </CardContent>
    </Card>
  );
}

function SmallMultiplesGrid({
  columns,
  metrics: metricList,
}: {
  columns: DoraProjectColumn[];
  metrics: { metric: DoraMetric; label: string; unit: string }[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card/30">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/20 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            <th className="w-[180px] px-4 py-2 text-left font-medium">Metric</th>
            {columns.map((c) => (
              <th key={c.id} className="px-3 py-2 text-left font-medium">
                <Link
                  href={`/projects/${c.id}`}
                  className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                >
                  <span>{c.name}</span>
                  <span className="font-mono text-[9px] opacity-60">[{c.shortKey}]</span>
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metricList.map((m) => (
            <tr key={m.metric} className="border-b border-border/40 last:border-0">
              <th scope="row" className="px-4 py-3 text-left text-sm font-medium text-foreground/90">
                {m.label}
              </th>
              {columns.map((c) => {
                const cell = c.cells[m.metric];
                if (!cell) {
                  return (
                    <td key={c.id} className="px-3 py-3 text-muted-foreground/50">
                      <Link href={`/projects/${c.id}`} className="block hover:opacity-80">
                        —
                      </Link>
                    </td>
                  );
                }
                const isRegression =
                  (m.metric === "change_failure_rate" || m.metric === "lead_time" || m.metric === "mttr") &&
                  cell.direction === "up";
                const isImproving =
                  (m.metric === "change_failure_rate" || m.metric === "lead_time" || m.metric === "mttr") &&
                  cell.direction === "down";
                const sparkDirection: "up" | "down" | "flat" =
                  m.metric === "deployment_frequency"
                    ? cell.direction
                    : cell.direction === "up"
                      ? "down"
                      : cell.direction === "down"
                        ? "up"
                        : "flat";
                return (
                  <td key={c.id} className="px-3 py-3">
                    <Link
                      href={`/projects/${c.id}`}
                      className="group flex items-center justify-between gap-3 hover:opacity-90"
                      title={`${m.label}: ${formatValue(cell.value, cell.unit)}${cell.wowDelta !== null ? ` (Δ ${cell.wowDelta})` : ""}`}
                    >
                      <span
                        className={cn(
                          "font-mono text-[12px] tabular-nums",
                          isRegression ? "text-trend-down" : isImproving ? "text-trend-up" : "text-foreground/85",
                        )}
                      >
                        {formatValue(cell.value, cell.unit)}
                      </span>
                      <Sparkline points={cell.sparkline} direction={sparkDirection} width={56} height={16} />
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttributionPanel({ finding }: { finding: AttributionFinding }) {
  return (
    <div className="space-y-4 rounded-lg border border-trend-down/30 bg-trend-down/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-trend-down">
            Causal attribution · {finding.metric.replaceAll("_", " ")}
          </div>
          <div className="mt-1 text-sm">
            <span className="font-medium">{finding.projectName}</span> drove the portfolio
            regression.
            {finding.skillName ? (
              <>
                {" "}Skill <Link href={`/skills/${finding.skillSlug ?? finding.skillName}`} className="font-mono underline">{finding.skillName}</Link>{" "}
                accounted for <span className="font-mono">{finding.actionsCount}</span> auto-merges
                during the regression window.
              </>
            ) : null}
          </div>
        </div>
        {finding.skillState ? (
          <div className="shrink-0 text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Skill state
            </div>
            <div className="mt-1 inline-flex items-center gap-2">
              <AutonomyPill level={finding.skillState.currentLevel} />
              {finding.skillState.levelChangedAt ? (
                <span className="font-mono text-[11px] text-muted-foreground">
                  since {finding.skillState.levelChangedAt}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div>
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          Timeline
        </div>
        <ul className="space-y-1">
          {finding.timeline.map((t, i) => (
            <li key={`${t.when}-${i}`} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-sm">
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{t.when}</span>
              <span className="text-foreground/85">{t.what}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          href={`/plans/new?kind=incident&projectId=${finding.projectId}`}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Open incident plan <ChevronRight className="h-3 w-3" aria-hidden />
        </Link>
        {finding.skillSlug ? (
          <Link
            href={`/skills/${finding.skillSlug}`}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-foreground/85 transition-colors hover:bg-muted"
          >
            View skill detail <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        ) : null}
        <Link
          href={`/projects/${finding.projectId}`}
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-foreground/85 transition-colors hover:bg-muted"
        >
          View affected project <ExternalLink className="h-3 w-3" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

const WINDOWS: { days: number; label: string }[] = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
];

function WindowSelector({ active }: { active: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const update = (days: number) => {
    const next = new URLSearchParams(params?.toString() ?? "");
    next.set("window", String(days));
    router.push(`/metrics?${next.toString()}`);
  };
  return (
    <div className="inline-flex overflow-hidden rounded-md border bg-muted/20">
      {WINDOWS.map((w) => (
        <button
          key={w.days}
          type="button"
          onClick={() => update(w.days)}
          className={cn(
            "px-3 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors",
            active === w.days
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}

export function MetricsClient({ data }: { data: PortfolioMetricsData }) {
  const metricList = [
    { metric: "lead_time" as DoraMetric, label: "Lead time", unit: "d" },
    { metric: "deployment_frequency" as DoraMetric, label: "Deploy freq", unit: "/wk" },
    { metric: "change_failure_rate" as DoraMetric, label: "Change failure", unit: "%" },
    { metric: "mttr" as DoraMetric, label: "MTTR", unit: "h" },
  ];
  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Cross-project DORA</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Portfolio aggregates over the last {data.windowDays} days. Refreshed{" "}
            {new Date(data.refreshedAt).toLocaleTimeString()}.
          </p>
        </div>
        <WindowSelector active={data.windowDays} />
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.aggregates.map((agg) => (
          <AggregateCard key={agg.metric} aggregate={agg} />
        ))}
      </div>

      <SmallMultiplesGrid columns={data.columns} metrics={metricList} />

      {data.attribution ? <AttributionPanel finding={data.attribution} /> : null}
    </div>
  );
}
