"use client";

import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import type { CockpitWorkItemClient } from "../serialize";

const SOURCE_CLASS: Record<string, string> = {
  github: "border-foreground/30 text-foreground",
  jira: "border-primary/40 text-primary",
  ado: "border-blue-500/40 text-blue-400",
  confluence: "border-purple-500/40 text-purple-400",
};

const STATUS_CLASS: Record<string, string> = {
  open: "text-state-pending",
  in_progress: "text-primary",
  done: "text-state-passed",
  closed: "text-muted-foreground",
  merged: "text-state-passed",
  cancelled: "text-state-failed",
};

function statusKey(s: string | null): string {
  if (!s) return "";
  return s.toLowerCase().replace(/\s+/g, "_");
}

export function WorkItemsTab({ items }: { items: CockpitWorkItemClient[] }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div>
            <div className="font-display text-base font-semibold">Work items</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {items.length} {items.length === 1 ? "item" : "items"} synced
            </div>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
            from connected adapters
          </span>
        </div>
        {items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No work items yet. Connect a GitHub, Jira, or Azure DevOps adapter on the{" "}
            <a className="text-primary hover:underline" href="/integrations">
              Integrations
            </a>{" "}
            page — items sync automatically via webhook.
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {items.map((w) => (
              <li key={w.id} className="flex items-center gap-3 px-4 py-2.5">
                <Badge
                  variant="outline"
                  className={`shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase ${SOURCE_CLASS[w.source] ?? ""}`}
                >
                  {w.source}
                </Badge>
                <span className="font-mono text-[10px] text-muted-foreground/80">{w.externalId}</span>
                <a
                  href={w.externalUrl ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-sm hover:underline"
                  title={w.title}
                >
                  {w.title}
                </a>
                <span className="flex shrink-0 items-center gap-2">
                  {w.kind ? (
                    <Badge variant="outline" className="px-1.5 py-0 font-mono text-[10px] uppercase">
                      {w.kind.replace(/_/g, " ")}
                    </Badge>
                  ) : null}
                  {w.status ? (
                    <span
                      className={`font-mono text-[10px] uppercase tracking-wide ${STATUS_CLASS[statusKey(w.status)] ?? "text-muted-foreground"}`}
                    >
                      {w.status}
                    </span>
                  ) : null}
                  {w.assigneeEmail ? (
                    <span
                      className="font-mono text-[10px] text-muted-foreground/70"
                      title={w.assigneeEmail}
                    >
                      @{w.assigneeEmail.split("@")[0]}
                    </span>
                  ) : null}
                  {w.externalUrl ? (
                    <a
                      href={w.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground/60 hover:text-foreground"
                      aria-label="Open in source system"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
