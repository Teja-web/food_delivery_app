"use client";

import { ExternalLink, ScrollText } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PLAN_KINDS, type PlanKind, type PlanStatus } from "@/db/schema/plan";
import { cn } from "@/lib/utils";

import type { PlanRowClient, PlansPageClient } from "./serialize";

const STATUS_TONE_CLASS: Record<PlanRowClient["statusTone"], string> = {
  neutral: "border-foreground/20 bg-foreground/5 text-foreground/85",
  info: "border-autonomy-junior/40 bg-autonomy-junior/10 text-autonomy-junior",
  success: "border-trend-up/40 bg-trend-up/10 text-trend-up",
  danger: "border-state-failed/40 bg-state-failed/10 text-state-failed",
  muted: "border-border/60 bg-muted/40 text-muted-foreground",
};

const KIND_TONE_CLASS: Record<PlanKind, string> = {
  epic: "border-autonomy-principal/40 text-autonomy-principal",
  feature: "border-autonomy-senior/40 text-autonomy-senior",
  story: "border-autonomy-junior/40 text-autonomy-junior",
  adr: "border-foreground/30 text-foreground/85",
  test_plan: "border-state-pending/40 text-state-pending",
  release_plan: "border-trend-up/40 text-trend-up",
  incident: "border-state-failed/40 text-state-failed",
  storyboard: "border-foreground/30 text-foreground/85",
  dev_summary: "border-foreground/30 text-foreground/85",
  go_live_report: "border-trend-up/40 text-trend-up",
  cicd_pipeline: "border-state-pending/40 text-state-pending",
};

type Filter =
  | { kind: "all" }
  | { kind: "status"; status: PlanStatus }
  | { kind: "kind"; planKind: PlanKind };

function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="bg-card/40">
      <CardContent className="space-y-1 pt-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </div>
        <div className="flex items-baseline justify-between">
          <span className="font-display text-2xl font-bold tabular-nums">{value}</span>
          {hint ? <span className="font-mono text-[10px] text-muted-foreground">{hint}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="unstyled"
      size="auto"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors",
        active
          ? "border-foreground/40 bg-foreground/5 text-foreground"
          : "border-border/60 text-muted-foreground hover:bg-muted/50",
      )}
    >
      {children}
    </Button>
  );
}

export function PlansClient({ data }: { data: PlansPageClient }) {
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [query, setQuery] = useState("");

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (filter.kind === "status" && r.status !== filter.status) return false;
      if (filter.kind === "kind" && r.kind !== filter.planKind) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.projectName.toLowerCase().includes(q) ||
        (r.summary ?? "").toLowerCase().includes(q)
      );
    });
  }, [data.rows, filter, query]);

  const drafts = data.counts.byStatus.draft ?? 0;
  const inReview = data.counts.byStatus.in_review ?? 0;
  const approved = (data.counts.byStatus.approved ?? 0) + (data.counts.byStatus.in_progress ?? 0);
  const completed = data.counts.byStatus.completed ?? 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">Plans</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Unified work artifact across epics, features, stories, ADRs, test plans, releases, and incidents.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Plans" value={data.counts.total} hint="across all projects" />
        <StatTile label="In review" value={inReview} hint={drafts > 0 ? `${drafts} draft` : undefined} />
        <StatTile label="In flight" value={approved} hint="approved + in progress" />
        <StatTile label="Completed" value={completed} />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Status
          </span>
          <FilterChip active={filter.kind === "all"} onClick={() => setFilter({ kind: "all" })}>
            All · {data.counts.total}
          </FilterChip>
          {(["draft", "in_review", "approved", "in_progress", "completed", "rejected"] as const).map((s) => {
            const n = data.counts.byStatus[s] ?? 0;
            if (n === 0 && filter.kind !== "status") return null;
            return (
              <FilterChip
                key={s}
                active={filter.kind === "status" && filter.status === s}
                onClick={() => setFilter({ kind: "status", status: s })}
              >
                {s.replace("_", " ")} · {n}
              </FilterChip>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Kind
          </span>
          {PLAN_KINDS.map(
            (k) => {
              const n = data.counts.byKind[k] ?? 0;
              if (n === 0) return null;
              return (
                <FilterChip
                  key={k}
                  active={filter.kind === "kind" && filter.planKind === k}
                  onClick={() => setFilter({ kind: "kind", planKind: k })}
                >
                  {k.replace("_", " ")} · {n}
                </FilterChip>
              );
            },
          )}
          <Input
            type="text"
            placeholder="Filter…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ml-auto h-7 w-44 rounded-md px-2.5 py-1 text-xs"
          />
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState query={query} filtered={filter.kind !== "all" || query.length > 0} />
      ) : (
        <div className="overflow-hidden rounded-md border border-border/60">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Kind</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 font-medium">Assignee</th>
                <th className="px-4 py-2 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30">
                  <td className="max-w-md px-4 py-3 align-top">
                    <div className="flex items-start gap-2">
                      <Link href={`/plans/${r.id}`} className="block min-w-0 hover:underline">
                        <div className="truncate font-medium">{r.title}</div>
                        {r.summary ? (
                          <div className="line-clamp-1 text-xs text-muted-foreground">{r.summary}</div>
                        ) : null}
                      </Link>
                      {r.externalRef ? (
                        <a
                          href={r.externalRef}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          title="Open external reference"
                        >
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Badge
                      variant="outline"
                      className={cn(
                        "bg-transparent font-mono text-[10px] uppercase tracking-[0.06em]",
                        KIND_TONE_CLASS[r.kind],
                      )}
                    >
                      {r.kindLabel}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Badge variant="outline" className={cn("font-mono text-[10px]", STATUS_TONE_CLASS[r.statusTone])}>
                      {r.statusLabel}
                    </Badge>
                    {r.priority ? (
                      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                        {r.priority}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-top text-sm">
                    <Link
                      href={`/projects/${r.projectId}`}
                      className="text-foreground/85 hover:text-foreground hover:underline"
                    >
                      {r.projectName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 align-top text-sm">
                    {r.assigneeName ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right align-top text-xs text-muted-foreground tabular-nums">
                    {r.updatedAtLabel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmptyState({ query, filtered }: { query: string; filtered: boolean }) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <ScrollText className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" aria-hidden />
        <div className="text-sm font-medium">
          {filtered ? "No plans match this filter" : "No plans yet"}
        </div>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          {filtered ? (
            <>Try a different status, kind, or clear the filter{query ? `: "${query}"` : ""}.</>
          ) : (
            <>Plans are authored in Cursor via the CLI. Open a project and click <em>New plan</em>.</>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
