"use client";

import { CircleAlert, ExternalLink, Kanban } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { PlanStatus } from "@/db/schema/plan/plan-artifact";
import { cn } from "@/lib/utils";

import type { PlanRowClient } from "../serialize";
import { KIND_DOT_CLASS } from "./tone";

type ColumnId = "draft" | "in_review" | "approved" | "in_progress" | "completed" | "rejected";

const COLUMNS: { id: ColumnId; label: string; matches: PlanStatus[]; tone: string }[] = [
  { id: "draft", label: "Draft", matches: ["draft"], tone: "border-border/60" },
  {
    id: "in_review",
    label: "In review",
    matches: ["in_review", "changes_requested"],
    tone: "border-autonomy-propose/40",
  },
  { id: "approved", label: "Approved", matches: ["approved"], tone: "border-trend-up/40" },
  { id: "in_progress", label: "In progress", matches: ["in_progress"], tone: "border-foreground/30" },
  { id: "completed", label: "Completed", matches: ["completed"], tone: "border-trend-up/40" },
  { id: "rejected", label: "Rejected", matches: ["rejected"], tone: "border-state-failed/40" },
];

export function PlansKanban({ rows, query, filtered }: { rows: PlanRowClient[]; query: string; filtered: boolean }) {
  const grouped = useMemo(() => {
    const groups = new Map<ColumnId, PlanRowClient[]>(COLUMNS.map((c) => [c.id, []]));
    for (const r of rows) {
      const col = COLUMNS.find((c) => c.matches.includes(r.status));
      if (col) groups.get(col.id)!.push(r);
    }
    return groups;
  }, [rows]);

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Kanban className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" aria-hidden />
          <div className="text-sm font-medium">
            {filtered ? "No plans match this filter" : "No plans yet"}
          </div>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            {filtered
              ? `Try a different status, kind, or clear the filter${query ? `: "${query}"` : ""}.`
              : "Kanban view groups plans by status."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-2">
      {COLUMNS.map((col) => {
        const items = grouped.get(col.id) ?? [];
        return (
          <div key={col.id} className="flex w-72 shrink-0 flex-col gap-2">
            <div
              className={cn(
                "flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground",
                col.tone,
              )}
            >
              <span>{col.label}</span>
              <span className="tabular-nums">{items.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {items.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/50 px-3 py-6 text-center text-[11px] text-muted-foreground/70">
                  Empty
                </div>
              ) : (
                items.map((r) => <KanbanCard key={r.id} row={r} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({ row }: { row: PlanRowClient }) {
  return (
    <Link
      href={`/plans/${row.id}`}
      className="group block rounded-md border border-border/60 bg-card p-3 hover:border-foreground/30 hover:bg-muted/30"
    >
      <div className="flex items-start gap-1.5">
        <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", KIND_DOT_CLASS[row.kind])} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {row.needsApproval ? (
              <CircleAlert className="h-3.5 w-3.5 shrink-0 text-state-pending" aria-label="Needs approval" />
            ) : null}
            <span className="line-clamp-2 text-sm font-medium group-hover:underline">{row.title}</span>
          </div>
          {row.status === "changes_requested" ? (
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-autonomy-propose">
              Changes requested
            </div>
          ) : null}
        </div>
        {row.externalRef ? (
          <a
            href={row.externalRef}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground"
            title="Open external reference"
          >
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <Badge
          variant="outline"
          className="bg-transparent px-1.5 py-0 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground"
        >
          {row.kindLabel}
        </Badge>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {row.priority ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.08em]">{row.priority}</span>
          ) : null}
          <span className="tabular-nums">{row.updatedAtLabel}</span>
        </div>
      </div>
    </Link>
  );
}
