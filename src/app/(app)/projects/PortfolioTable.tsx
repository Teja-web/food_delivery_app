"use client";

import { ChevronRight, FolderPlus, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { GateDot } from "@/components/trust/GateDot";
import { StatusDot } from "@/components/trust/StatusDot";
import { TrendIndicator } from "@/components/trust/TrendIndicator";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "@/components/viz/Sparkline";
import { cn } from "@/lib/utils";

import type { PortfolioClient, PortfolioProjectClient } from "./serialize";

const FILTER_PARAM = "autonomy";

type FilterKey = "below-merge" | "lead-only" | "recent-incidents";

const FILTERS: { key: FilterKey; label: string; description: string }[] = [
  {
    key: "below-merge",
    label: "Below Merge",
    description: "At least one skill at Observe or Propose on this project",
  },
  {
    key: "lead-only",
    label: "Lead only",
    description: "Every autonomy-bearing skill on this project is at Lead",
  },
  {
    key: "recent-incidents",
    label: "Recent incidents (7d)",
    description: "Project saw a skill incident in the last 7 days",
  },
];

function projectMatchesFilters(
  project: PortfolioProjectClient,
  active: Set<FilterKey>,
): boolean {
  if (active.size === 0) return true;
  const p = project.autonomyPosture;
  // AND-combine: every active chip must be satisfied.
  for (const key of active) {
    if (key === "below-merge") {
      if (p.observe + p.propose === 0) return false;
    } else if (key === "lead-only") {
      if (p.total === 0 || p.observe + p.propose + p.merge !== 0) return false;
    } else if (key === "recent-incidents") {
      if (p.incidentsLast7d === 0) return false;
    }
  }
  return true;
}

function AutonomyFilterChips({
  active,
  onToggle,
}: {
  active: Set<FilterKey>;
  onToggle: (key: FilterKey) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Filter
      </span>
      {FILTERS.map((f) => {
        const on = active.has(f.key);
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => onToggle(f.key)}
            title={f.description}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
              on
                ? "border-foreground/50 bg-foreground/10 text-foreground"
                : "border-border/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
            aria-pressed={on}
          >
            {f.label}
          </button>
        );
      })}
      {active.size > 0 ? (
        <button
          type="button"
          onClick={() => {
            for (const k of active) onToggle(k);
          }}
          className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          clear
        </button>
      ) : null}
    </div>
  );
}

function formatNumber(n: number, digits = 1): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function StatusPill({ status }: { status: PortfolioProjectClient["status"] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border bg-transparent px-1.5 py-0 font-mono text-[10px] uppercase tracking-[0.06em]",
        status === "active"
          ? "border-autonomy-merge/40 text-autonomy-merge"
          : "border-muted-foreground/30 text-muted-foreground/85",
      )}
    >
      {status}
    </Badge>
  );
}

function AutonomyPostureCluster({
  posture,
}: {
  posture: PortfolioProjectClient["autonomyPosture"];
}) {
  if (posture.total === 0) {
    return <span className="text-xs text-muted-foreground/60">—</span>;
  }
  const cells: { count: number; tone: string; label: string }[] = [
    { count: posture.observe, tone: "bg-muted text-muted-foreground", label: "Observe" },
    { count: posture.propose, tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300", label: "Propose" },
    { count: posture.merge, tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", label: "Merge" },
    { count: posture.lead, tone: "bg-violet-500/15 text-violet-700 dark:text-violet-300", label: "Lead" },
  ];
  return (
    <span
      className="inline-flex items-center gap-0.5"
      title={cells
        .map((c) => `${c.label}: ${c.count}`)
        .concat(
          posture.incidentsLast7d > 0
            ? [`Incidents (7d): ${posture.incidentsLast7d}`]
            : [],
        )
        .join("\n")}
    >
      {cells.map((c) =>
        c.count > 0 ? (
          <span
            key={c.label}
            className={cn(
              "inline-flex h-4 min-w-[14px] items-center justify-center rounded-sm px-1 font-mono text-[9px] font-medium tabular-nums",
              c.tone,
            )}
          >
            {c.count}
          </span>
        ) : null,
      )}
      {posture.incidentsLast7d > 0 ? (
        <span
          className="ml-0.5 inline-flex h-4 min-w-[14px] items-center justify-center rounded-sm bg-trend-down/15 px-1 font-mono text-[9px] font-medium text-trend-down tabular-nums"
          aria-label={`${posture.incidentsLast7d} recent incident${posture.incidentsLast7d === 1 ? "" : "s"}`}
        >
          !{posture.incidentsLast7d}
        </span>
      ) : null}
    </span>
  );
}

function GateCluster({
  gates,
  className,
}: {
  gates: PortfolioProjectClient["gates"];
  className?: string;
}) {
  if (gates.total === 0) {
    return <span className={cn("text-xs text-muted-foreground/60", className)}>—</span>;
  }
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {gates.passed}/{gates.total}
      </span>
      <span className="inline-flex items-center gap-1">
        {gates.items.map((g, i) => (
          <GateDot
            key={`${g.name}-${i}`}
            state={g.state}
            title={`${g.name}: ${g.state}`}
          />
        ))}
      </span>
    </span>
  );
}

function RollupStrip({ rollup }: { rollup: PortfolioClient["rollup"] }) {
  const cfrTone = rollup.portfolioCFR.wowDeltaPoints > 0 ? "danger" : "success";
  return (
    <div className="flex items-center gap-8 rounded-lg border bg-card/30 px-6 py-4">
      <Link
        href="/plans?needs=approval"
        className="flex items-baseline gap-2 transition-opacity hover:opacity-80"
      >
        <span className="font-display text-3xl font-bold tabular-nums">
          {rollup.openApprovals}
        </span>
        <span className="text-xs text-muted-foreground">open approvals</span>
      </Link>
      <div className="h-8 w-px bg-border/60" />
      <Link
        href="/metrics"
        className="flex items-baseline gap-2 transition-opacity hover:opacity-80"
      >
        <span className="font-display text-3xl font-bold tabular-nums">
          {rollup.deploysThisWeek}
        </span>
        <span className="text-xs text-muted-foreground">deploys / wk</span>
      </Link>
      <div className="h-8 w-px bg-border/60" />
      <Link
        href="/skills"
        className="flex items-baseline gap-2 transition-opacity hover:opacity-80"
      >
        <span className="font-display text-3xl font-bold tabular-nums">
          {rollup.autonomyEvents.promotions + rollup.autonomyEvents.demotions}
        </span>
        <span className="text-xs text-muted-foreground">autonomy events</span>
        <span className="ml-1 font-mono text-[11px] text-muted-foreground/80 tabular-nums">
          <span className="text-trend-up">↑{rollup.autonomyEvents.promotions}</span>{" "}
          <span className="text-trend-down">↓{rollup.autonomyEvents.demotions}</span>
        </span>
      </Link>
      <div className="h-8 w-px bg-border/60" />
      <Link
        href="/metrics"
        className="flex items-baseline gap-2 transition-opacity hover:opacity-80"
      >
        <span className="font-display text-3xl font-bold tabular-nums">
          {rollup.portfolioCFR.value !== null ? `${Math.round(rollup.portfolioCFR.value * 100)}%` : "—"}
        </span>
        <span className="text-xs text-muted-foreground">portfolio CFR</span>
        <TrendIndicator
          direction={rollup.portfolioCFR.wowDeltaPoints > 0 ? "up" : rollup.portfolioCFR.wowDeltaPoints < 0 ? "down" : "flat"}
          value={`${rollup.portfolioCFR.wowDeltaPoints > 0 ? "+" : ""}${rollup.portfolioCFR.wowDeltaPoints}pt`}
          tone={cfrTone}
          className="ml-1"
        />
      </Link>
    </div>
  );
}

function ProjectRow({ project }: { project: PortfolioProjectClient }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className={cn(
        "group grid h-9 grid-cols-[18px_minmax(0,1.6fr)_120px_140px_72px_72px_72px_96px_88px_24px] items-center gap-3 border-b border-border/40 px-3 text-sm transition-colors duration-[var(--motion-short)]",
        "hover:bg-muted/40",
        project.isStale && "opacity-55 hover:opacity-90",
      )}
    >
      <StatusDot status={project.health} />
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium text-foreground">{project.name}</span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">
          [{project.shortKey}]
        </span>
        {project.hasRegression ? (
          <Badge
            variant="outline"
            className="shrink-0 border-trend-down/40 bg-trend-down/10 px-1.5 py-0 text-[9px] font-medium uppercase tracking-wide text-trend-down"
          >
            CFR ↑
          </Badge>
        ) : null}
        {project.isStale ? (
          <Badge
            variant="outline"
            className="shrink-0 border-muted-foreground/40 px-1.5 py-0 text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            Inactive {project.staleDays}d
          </Badge>
        ) : null}
      </div>
      <StatusPill status={project.status} />
      <GateCluster gates={project.gates} />
      <span className="text-center font-mono text-[12px] tabular-nums text-muted-foreground">
        {project.openApprovals > 0 ? (
          <span className="text-foreground">{project.openApprovals}</span>
        ) : (
          <span className="opacity-50">—</span>
        )}
      </span>
      <span className="text-center font-mono text-[12px] tabular-nums">
        {project.leadTimeDays !== null ? (
          <span className="text-foreground/85">{formatNumber(project.leadTimeDays)}d</span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </span>
      <span className="text-center font-mono text-[12px] tabular-nums">
        {project.deploys30d !== null ? (
          <span className="text-foreground/85">{formatNumber(project.deploys30d, 1)}</span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </span>
      <span className="inline-flex items-center justify-start">
        <AutonomyPostureCluster posture={project.autonomyPosture} />
      </span>
      <span className="inline-flex items-center justify-end gap-2">
        {project.cfrSparkline ? (
          <Sparkline
            points={project.cfrSparkline}
            direction={
              project.cfrTrendDirection
                ? project.cfrTrendDirection === "up"
                  ? "down" // CFR up = bad → red
                  : project.cfrTrendDirection === "down"
                    ? "up" // CFR down = good → green
                    : "flat"
                : "flat"
            }
            width={48}
            height={14}
          />
        ) : null}
        {project.cfr30d !== null ? (
          <span
            className={cn(
              "font-mono text-[12px] tabular-nums",
              project.cfr30d >= 0.15
                ? "text-trend-down"
                : project.cfr30d >= 0.1
                  ? "text-state-pending"
                  : "text-foreground/85",
            )}
          >
            {Math.round(project.cfr30d * 100)}%
          </span>
        ) : (
          <span className="font-mono text-[12px] text-muted-foreground/50">—</span>
        )}
      </span>
      <ChevronRight
        className="h-3.5 w-3.5 text-muted-foreground/40 transition-transform duration-[var(--motion-short)] group-hover:translate-x-0.5 group-hover:text-muted-foreground"
        aria-hidden
      />
    </Link>
  );
}

export function PortfolioTable({
  data,
}: {
  data: PortfolioClient;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const active = useMemo<Set<FilterKey>>(() => {
    const raw = searchParams.get(FILTER_PARAM);
    if (!raw) return new Set();
    const valid = new Set(FILTERS.map((f) => f.key));
    return new Set(raw.split(",").filter((k): k is FilterKey => valid.has(k as FilterKey)));
  }, [searchParams]);

  const toggle = useCallback(
    (key: FilterKey) => {
      const next = new Set(active);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      const params = new URLSearchParams(searchParams.toString());
      if (next.size === 0) params.delete(FILTER_PARAM);
      else params.set(FILTER_PARAM, Array.from(next).join(","));
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "?");
    },
    [active, searchParams, router],
  );

  const filteredProjects = useMemo(
    () => data.projects.filter((p) => projectMatchesFilters(p, active)),
    [data.projects, active],
  );

  const noProjects = data.projects.length === 0;
  const filteredEmpty = !noProjects && filteredProjects.length === 0;

  return (
    <div className="space-y-6">
      <RollupStrip rollup={data.rollup} />

      {noProjects ? (
        <div className="rounded-lg border bg-card/30">
          <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border/60 bg-background/50">
              <FolderPlus
                className="h-5 w-5 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
            </div>
            <div className="space-y-2">
              <h2 className="font-display text-lg font-semibold text-foreground">
                No projects yet
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                A project is the delivery container coznt governs. Create one
                to start gating AI changes, verifying outcomes, and building
                trust.
              </p>
            </div>
            <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
              <span>Govern</span>
              <span className="h-px w-3 bg-border" aria-hidden />
              <span>Verify</span>
              <span className="h-px w-3 bg-border" aria-hidden />
              <span>Trust</span>
            </div>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New project
            </Link>
          </div>
        </div>
      ) : (
        <>
          <AutonomyFilterChips active={active} onToggle={toggle} />
          <div className="overflow-hidden rounded-lg border bg-card/30">
            <div className="grid h-8 grid-cols-[18px_minmax(0,1.6fr)_120px_140px_72px_72px_72px_96px_88px_24px] items-center gap-3 border-b bg-muted/20 px-3 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              <span />
              <span>Project</span>
              <span>Status</span>
              <span>Records</span>
              <span className="text-center">Open</span>
              <span className="text-center">Lead</span>
              <span className="text-center">Deploys</span>
              <span>Autonomy</span>
              <span className="text-right">CFR 30d</span>
              <span />
            </div>
            {filteredEmpty ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No projects match the active filters.
              </div>
            ) : (
              <div>
                {filteredProjects.map((p) => (
                  <ProjectRow key={p.id} project={p} />
                ))}
              </div>
            )}
          </div>
          {active.size > 0 ? (
            <p className="text-[11px] text-muted-foreground/70">
              Showing {filteredProjects.length} of {data.projects.length} projects.
            </p>
          ) : null}
        </>
      )}

      {noProjects ? null : (
        <p className="text-[11px] text-muted-foreground/70">
          Sources: GitHub deployments, Jira approvals, coznt audit log · last sync just now
        </p>
      )}
    </div>
  );
}
