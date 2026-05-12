"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { GateDot } from "@/components/trust/GateDot";
import { StatusDot } from "@/components/trust/StatusDot";
import { TrendIndicator } from "@/components/trust/TrendIndicator";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "@/components/viz/Sparkline";
import { cn } from "@/lib/utils";

import type { PortfolioClient, PortfolioProjectClient } from "./serialize";

const PHASE_LABEL: Record<PortfolioProjectClient["phase"], string> = {
  requirements: "REQUIREMENTS",
  design: "DESIGN",
  development: "DEVELOPMENT",
  testing: "TESTING",
  cicd: "CI/CD",
  monitoring: "MONITORING",
};

const PHASE_ACCENT: Record<PortfolioProjectClient["phase"], string> = {
  requirements: "border-muted-foreground/30 text-muted-foreground/85",
  design: "border-autonomy-junior/40 text-autonomy-junior",
  development: "border-autonomy-senior/40 text-autonomy-senior",
  testing: "border-state-pending/40 text-state-pending",
  cicd: "border-autonomy-principal/40 text-autonomy-principal",
  monitoring: "border-trend-up/40 text-trend-up",
};

function formatNumber(n: number, digits = 1): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function PhasePill({ phase }: { phase: PortfolioProjectClient["phase"] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border bg-transparent px-1.5 py-0 font-mono text-[10px] uppercase tracking-[0.06em]",
        PHASE_ACCENT[phase],
      )}
    >
      {PHASE_LABEL[phase]}
    </Badge>
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
        href="/approvals"
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
          {Math.round(rollup.portfolioCFR.value * 100)}%
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
        "group grid h-9 grid-cols-[18px_minmax(0,1.6fr)_120px_140px_72px_72px_72px_88px_24px] items-center gap-3 border-b border-border/40 px-3 text-sm transition-colors duration-[var(--motion-short)]",
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
      <PhasePill phase={project.phase} />
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

export function PortfolioTable({ data }: { data: PortfolioClient }) {
  const noProjects = data.projects.length === 0;
  return (
    <div className="space-y-6">
      <RollupStrip rollup={data.rollup} />

      {noProjects ? (
        <div className="flex items-center justify-between rounded-lg border bg-card/30 px-6 py-12 text-sm text-muted-foreground">
          <span>No projects yet.</span>
          <Link
            href="/projects/new"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            + New project
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card/30">
          <div className="grid h-8 grid-cols-[18px_minmax(0,1.6fr)_120px_140px_72px_72px_72px_88px_24px] items-center gap-3 border-b bg-muted/20 px-3 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            <span />
            <span>Project</span>
            <span>Phase</span>
            <span>Gates</span>
            <span className="text-center">Open</span>
            <span className="text-center">Lead</span>
            <span className="text-center">Deploys</span>
            <span className="text-right">CFR 30d</span>
            <span />
          </div>
          <div>
            {data.projects.map((p) => (
              <ProjectRow key={p.id} project={p} />
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground/70">
        Sources: GitHub deployments, Jira approvals, coznt audit log · last sync just now
      </p>
    </div>
  );
}
