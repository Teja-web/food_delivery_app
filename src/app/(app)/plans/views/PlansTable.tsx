"use client";

import { CircleAlert, ExternalLink, ScrollText } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { PlanRelationshipRowClient, PlanRowClient } from "../serialize";
import { KIND_TONE_CLASS, STATUS_TONE_CLASS } from "./tone";

export function PlansTable({
  rows,
  relationships,
  query,
  filtered,
}: {
  rows: PlanRowClient[];
  relationships: PlanRelationshipRowClient[];
  query: string;
  filtered: boolean;
}) {
  const parentByChildId = useMemo(() => {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const map = new Map<string, PlanRowClient>();
    for (const rel of relationships) {
      if (rel.kind !== "parent_of") continue;
      const parent = byId.get(rel.fromPlanArtifactId);
      if (!parent) continue;
      // First parent wins; multi-parent plans surface only one in the table.
      if (!map.has(rel.toPlanArtifactId)) map.set(rel.toPlanArtifactId, parent);
    }
    return map;
  }, [rows, relationships]);

  if (rows.length === 0) return <EmptyState query={query} filtered={filtered} />;

  return (
    <div className="overflow-hidden rounded-md border border-border/60">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-muted/30 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <th className="px-4 py-2 font-medium">Title</th>
            <th className="px-4 py-2 font-medium">Kind</th>
            <th className="px-4 py-2 font-medium">Parent</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Project</th>
            <th className="px-4 py-2 font-medium">Assignee</th>
            <th className="px-4 py-2 text-right font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30">
              <td className="max-w-md px-4 py-3 align-top">
                <div className="flex items-start gap-2">
                  <Link href={`/plans/${r.id}`} className="block min-w-0 hover:underline">
                    <div className="flex items-center gap-1.5 truncate font-medium">
                      {r.needsApproval ? (
                        <CircleAlert
                          className="h-3.5 w-3.5 shrink-0 text-state-pending"
                          aria-label="Needs approval"
                        />
                      ) : null}
                      <span className="truncate">{r.title}</span>
                    </div>
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
              <td className="max-w-[14rem] px-4 py-3 align-top text-sm">
                {(() => {
                  const parent = parentByChildId.get(r.id);
                  if (!parent) return <span className="text-muted-foreground">—</span>;
                  return (
                    <Link
                      href={`/plans/${parent.id}`}
                      className="truncate text-foreground/85 hover:text-foreground hover:underline"
                      title={parent.title}
                    >
                      <span className="truncate">{parent.title}</span>
                    </Link>
                  );
                })()}
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
