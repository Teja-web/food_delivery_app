"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLAN_KINDS, type PlanKind, type PlanStatus } from "@/db/schema/plan/plan-artifact";
import { cn } from "@/lib/utils";

import type { PlansPageClient } from "./serialize";
import { PlansKanban } from "./views/PlansKanban";
import { PlansTable } from "./views/PlansTable";
import { PlansTree } from "./views/PlansTree";
import { KIND_DOT_CLASS, STATUS_FILTER_TONE } from "./views/tone";
import { isPlanViewKind, ViewToggle, type PlanViewKind } from "./views/ViewToggle";
import { PushPlansToJiraButton } from "./PushPlansToJiraButton";

type Filter =
  | { kind: "all" }
  | { kind: "needs_approval" }
  | { kind: "status"; status: PlanStatus }
  | { kind: "kind"; planKind: PlanKind };

function StatusFilterChip({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone?: string;
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
        "rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors",
        active
          ? tone ?? "border-foreground/40 bg-foreground/5 text-foreground"
          : "border-border/60 text-muted-foreground hover:bg-muted/50",
      )}
    >
      {children}
    </Button>
  );
}

function KindFilterChip({
  active,
  dot,
  onClick,
  children,
}: {
  active: boolean;
  dot: string;
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
        "flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors",
        active
          ? "border-foreground/50 bg-foreground/5 text-foreground"
          : "border-border/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} aria-hidden />
      {children}
    </Button>
  );
}

function defaultView(projectId: string | null): PlanViewKind {
  // Project-scoped pages default to Tree (hierarchy is most legible there).
  // Global /plans defaults to Table.
  return projectId ? "tree" : "table";
}

export function PlansClient({ data }: { data: PlansPageClient }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialFilter: Filter =
    params?.get("needs") === "approval" ? { kind: "needs_approval" } : { kind: "all" };
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [query, setQuery] = useState("");

  const viewParam = params?.get("view");
  const view: PlanViewKind = isPlanViewKind(viewParam) ? viewParam : defaultView(data.projectId);

  const setView = useCallback(
    (next: PlanViewKind) => {
      const next_params = new URLSearchParams(params?.toString() ?? "");
      if (next === defaultView(data.projectId)) {
        next_params.delete("view");
      } else {
        next_params.set("view", next);
      }
      const qs = next_params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router, data.projectId],
  );

  useEffect(() => {
    if (params?.get("needs") === "approval") setFilter({ kind: "needs_approval" });
  }, [params]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (filter.kind === "needs_approval" && !r.needsApproval) return false;
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

  const needsApproval = data.counts.needsApproval ?? 0;
  const isFiltered = filter.kind !== "all" || query.length > 0;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Status
          </span>
          <StatusFilterChip active={filter.kind === "all"} onClick={() => setFilter({ kind: "all" })}>
            All · {data.counts.total}
          </StatusFilterChip>
          {needsApproval > 0 ? (
            <StatusFilterChip
              active={filter.kind === "needs_approval"}
              tone="border-state-pending/50 bg-state-pending/15 text-state-pending"
              onClick={() => setFilter({ kind: "needs_approval" })}
            >
              Needs approval · {needsApproval}
            </StatusFilterChip>
          ) : null}
          {(["draft", "in_review", "approved", "in_progress", "completed", "rejected"] as const).map((s) => {
            const n = data.counts.byStatus[s] ?? 0;
            if (n === 0 && filter.kind !== "status") return null;
            return (
              <StatusFilterChip
                key={s}
                active={filter.kind === "status" && filter.status === s}
                tone={STATUS_FILTER_TONE[s]}
                onClick={() => setFilter({ kind: "status", status: s })}
              >
                {s.replace("_", " ")} · {n}
              </StatusFilterChip>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Kind
          </span>
          {PLAN_KINDS.map((k) => {
            const n = data.counts.byKind[k] ?? 0;
            if (n === 0) return null;
            return (
              <KindFilterChip
                key={k}
                active={filter.kind === "kind" && filter.planKind === k}
                dot={KIND_DOT_CLASS[k]}
                onClick={() => setFilter({ kind: "kind", planKind: k })}
              >
                {k.replace("_", " ")} · {n}
              </KindFilterChip>
            );
          })}
          <Input
            type="text"
            placeholder="Filter…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ml-auto h-7 w-44 rounded-md px-2.5 py-1 text-xs"
          />
          <PushPlansToJiraButton
            mode="all"
            projectId={data.projectId}
            totalCount={data.counts.jiraPushTargets}
          />
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      {view === "table" ? (
        <PlansTable
          rows={filteredRows}
          relationships={data.relationships}
          query={query}
          filtered={isFiltered}
        />
      ) : view === "tree" ? (
        <PlansTree
          rows={filteredRows}
          relationships={data.relationships}
          query={query}
          filtered={isFiltered}
        />
      ) : (
        <PlansKanban rows={filteredRows} query={query} filtered={isFiltered} />
      )}
    </div>
  );
}
