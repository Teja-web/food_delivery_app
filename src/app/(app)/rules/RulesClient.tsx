"use client";

import { Shield, ShieldOff, Globe2, Folder, AlertTriangle, Info, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { RuleSeverity } from "@/db/schema/rule";
import { cn } from "@/lib/utils";

import type { RuleRowClient, RulesPageClient } from "./serialize";

const SEVERITY_TONE_CLASS: Record<RuleSeverity, string> = {
  info: "border-autonomy-junior/40 bg-autonomy-junior/10 text-autonomy-junior",
  warn: "border-state-pending/40 bg-state-pending/10 text-state-pending",
  error: "border-state-failed/40 bg-state-failed/10 text-state-failed",
};

const SEVERITY_ICON: Record<RuleSeverity, typeof AlertTriangle> = {
  info: Info,
  warn: AlertTriangle,
  error: AlertCircle,
};

type Filter =
  | { kind: "all" }
  | { kind: "scope"; scope: "org" | "project" }
  | { kind: "severity"; severity: RuleSeverity };

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

function RuleRow({ rule }: { rule: RuleRowClient }) {
  const SeverityIcon = SEVERITY_ICON[rule.severity];
  return (
    <div className="grid grid-cols-[24px_minmax(0,1fr)_auto_auto_auto] items-start gap-4 border-b border-border/40 px-4 py-3 last:border-b-0 hover:bg-muted/30">
      <div className={cn("mt-0.5", rule.enabled ? "text-foreground/70" : "text-muted-foreground/40")}>
        <SeverityIcon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-medium", rule.enabled ? "text-foreground" : "text-muted-foreground line-through")}>
            {rule.title}
          </span>
          {rule.tags.length > 0 ? (
            <div className="flex items-center gap-1">
              {rule.tags.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="rounded border border-border/60 bg-muted/30 px-1.5 py-0 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground"
                >
                  {t}
                </span>
              ))}
              {rule.tags.length > 3 ? (
                <span className="font-mono text-[10px] text-muted-foreground">+{rule.tags.length - 3}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        {rule.body ? (
          <p className="line-clamp-2 text-xs text-muted-foreground/85">{rule.body}</p>
        ) : null}
        <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground/70">
          <span>{rule.slug}</span>
        </div>
      </div>
      <div className="text-right">
        <Badge variant="outline" className={cn("font-mono text-[10px]", SEVERITY_TONE_CLASS[rule.severity])}>
          {rule.severity}
        </Badge>
      </div>
      <div className="text-right">
        <Badge
          variant="outline"
          className="border-border/60 bg-transparent font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground"
        >
          {rule.phase ?? "all phases"}
        </Badge>
      </div>
      <div className="text-right">
        {rule.scope === "project" && rule.projectId ? (
          <Link
            href={`/projects/${rule.projectId}`}
            className="inline-flex items-center gap-1 font-mono text-[10px] text-foreground/85 hover:underline"
          >
            <Folder className="h-3 w-3" aria-hidden />
            {rule.projectName}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
            <Globe2 className="h-3 w-3" aria-hidden />
            org-wide
          </span>
        )}
      </div>
    </div>
  );
}

export function RulesClient({ data }: { data: RulesPageClient }) {
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (filter.kind === "scope" && r.scope !== filter.scope) return false;
      if (filter.kind === "severity" && r.severity !== filter.severity) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        (r.body ?? "").toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [data.rows, filter, query]);

  const orgRules = filtered.filter((r) => r.scope === "org");
  const perProjectRules = filtered.filter((r) => r.scope === "project");

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Rules</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Constraints agents validate against on demand. Org-wide rules apply everywhere; project rules layer on top.
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Rules" value={data.counts.total} hint={`${data.counts.enabled} enabled`} />
        <StatTile label="Org-wide" value={data.counts.org} />
        <StatTile label="Per-project" value={data.counts.perProject} />
        <StatTile
          label="By severity"
          value={data.counts.bySeverity.error ?? 0}
          hint={`error · ${data.counts.bySeverity.warn ?? 0} warn`}
        />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Scope
          </span>
          <FilterChip active={filter.kind === "all"} onClick={() => setFilter({ kind: "all" })}>
            All · {data.counts.total}
          </FilterChip>
          <FilterChip
            active={filter.kind === "scope" && filter.scope === "org"}
            onClick={() => setFilter({ kind: "scope", scope: "org" })}
          >
            Org-wide · {data.counts.org}
          </FilterChip>
          <FilterChip
            active={filter.kind === "scope" && filter.scope === "project"}
            onClick={() => setFilter({ kind: "scope", scope: "project" })}
          >
            Per-project · {data.counts.perProject}
          </FilterChip>
          <span className="ml-4 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Severity
          </span>
          {(["info", "warn", "error"] as const).map((s) => {
            const n = data.counts.bySeverity[s] ?? 0;
            if (n === 0) return null;
            return (
              <FilterChip
                key={s}
                active={filter.kind === "severity" && filter.severity === s}
                onClick={() => setFilter({ kind: "severity", severity: s })}
              >
                {s} · {n}
              </FilterChip>
            );
          })}
          <Input
            type="text"
            placeholder="Filter…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ml-auto h-7 w-44 rounded-md px-2.5 py-1 text-xs"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState filtered={filter.kind !== "all" || query.length > 0} />
      ) : (
        <div className="space-y-6">
          {orgRules.length > 0 ? (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <Globe2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Org-wide · {orgRules.length}
                </h2>
              </div>
              <div className="overflow-hidden rounded-md border border-border/60">
                {orgRules.map((r) => (
                  <RuleRow key={r.id} rule={r} />
                ))}
              </div>
            </section>
          ) : null}

          {perProjectRules.length > 0 ? (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <Folder className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Per-project · {perProjectRules.length}
                </h2>
              </div>
              <div className="overflow-hidden rounded-md border border-border/60">
                {perProjectRules.map((r) => (
                  <RuleRow key={r.id} rule={r} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  const Icon = filtered ? ShieldOff : Shield;
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <Icon className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" aria-hidden />
        <div className="text-sm font-medium">
          {filtered ? "No rules match this filter" : "No rules yet"}
        </div>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          {filtered ? (
            <>Try a different scope, severity, or clear the filter.</>
          ) : (
            <>
              Rules enforce conventions across projects — e.g. <span className="font-mono">no-direct-db-import</span>,
              {" "}
              <span className="font-mono">pr-checklist-complete</span>. Author them in your repo
              and sync via the API.
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
