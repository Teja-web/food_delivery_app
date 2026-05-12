import Link from "next/link";

import { AutonomyPill } from "@/components/trust/AutonomyPill";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "@/components/viz/Sparkline";
import { cn } from "@/lib/utils";

import type { AutonomyDistribution, SkillLedgerRowClient } from "./serialize";

function relativeFromNow(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const ms = date.getTime() - Date.now();
  const abs = Math.abs(ms);
  const days = Math.round(abs / (24 * 60 * 60 * 1000));
  const sign = ms < 0 ? "ago" : "in";
  if (days >= 1) return `${sign === "ago" ? "" : "in "}${days}d${sign === "ago" ? " ago" : ""}`;
  const hours = Math.round(abs / (60 * 60 * 1000));
  return `${sign === "ago" ? "" : "in "}${hours}h${sign === "ago" ? " ago" : ""}`;
}

function SkillRow({ row }: { row: SkillLedgerRowClient }) {
  const sparkDirection =
    row.stats.success === 0 ? "flat" : row.stats.incident > 0 ? "down" : "up";
  return (
    <Link
      href={`/skills/${row.id}`}
      className="group grid grid-cols-[minmax(0,1.6fr)_120px_minmax(0,1fr)_64px_72px] items-center gap-3 border-b border-border/40 px-4 py-3 transition-colors hover:bg-muted/40"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{row.name}</div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">{row.slug}</div>
      </div>
      <div>
        <AutonomyPill
          level={row.levelLabel}
          title={row.lastReason ?? undefined}
        />
      </div>
      <div className="font-mono text-[12px] tabular-nums text-muted-foreground">
        <span className="text-trend-up">{row.stats.success}✓</span>
        <span className="mx-1 opacity-40">/</span>
        <span className="text-verdict-rollback">{row.stats.rollback}↻</span>
        <span className="mx-1 opacity-40">/</span>
        <span className="text-verdict-incident">{row.stats.incident}⚡</span>
        <span className="ml-2 opacity-50">{row.stats.windowDays}d</span>
      </div>
      <div className="text-right font-mono text-[11px] text-muted-foreground tabular-nums">
        {row.nextReviewAt ? relativeFromNow(row.nextReviewAt) : "—"}
      </div>
      <div className="flex justify-end">
        <Sparkline points={row.stats.sparkline} direction={sparkDirection} width={56} height={16} />
      </div>
    </Link>
  );
}

function DistributionBar({ dist }: { dist: AutonomyDistribution }) {
  if (dist.total === 0) return null;
  const segments = [
    { key: "intern", n: dist.intern, color: "bg-autonomy-intern" },
    { key: "junior", n: dist.junior, color: "bg-autonomy-junior" },
    { key: "senior", n: dist.senior, color: "bg-autonomy-senior" },
    { key: "principal", n: dist.principal, color: "bg-autonomy-principal" },
  ];
  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Autonomy distribution · {dist.total} skill{dist.total === 1 ? "" : "s"}
      </div>
      <div className="flex h-3 overflow-hidden rounded-full border bg-muted/20">
        {segments.map((s) =>
          s.n === 0 ? null : (
            <div
              key={s.key}
              className={cn("h-full", s.color)}
              style={{ width: `${(s.n / dist.total) * 100}%` }}
              title={`${s.key}: ${s.n}`}
            />
          ),
        )}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {segments.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className={cn("inline-block h-2 w-2 rounded-full", s.color)} /> {s.key}{" "}
            <span className="font-mono tabular-nums">{s.n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function SkillsLedgerTable({
  rows,
  distribution,
}: {
  rows: SkillLedgerRowClient[];
  distribution: AutonomyDistribution;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card/30 px-6 py-12 text-center text-sm text-muted-foreground">
        No skills registered yet.{" "}
        <Link href="/skills/audit" className="underline">
          Open an audit query
        </Link>{" "}
        when the first invocations land.
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            All skills · {rows.length}
          </div>
          <Link href="/skills/audit" className="text-xs text-muted-foreground hover:text-foreground">
            Audit query →
          </Link>
        </div>
        <div className="overflow-hidden rounded-lg border bg-card/30">
          <div className="grid grid-cols-[minmax(0,1.6fr)_120px_minmax(0,1fr)_64px_72px] items-center gap-3 border-b bg-muted/20 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            <span>Skill</span>
            <span>Level</span>
            <span>30-day stats</span>
            <span className="text-right">Review</span>
            <span className="text-right">Trend</span>
          </div>
          {rows.map((row) => (
            <SkillRow key={row.id} row={row} />
          ))}
        </div>
      </div>
      <DistributionBar dist={distribution} />
      {/* Enabled chip set */}
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {rows
          .filter((r) => !r.enabled)
          .map((r) => (
            <Badge key={r.id} variant="outline" className="text-muted-foreground">
              {r.slug} · disabled
            </Badge>
          ))}
      </div>
    </div>
  );
}
