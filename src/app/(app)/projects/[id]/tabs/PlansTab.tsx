"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import type { CockpitPlanClient } from "../serialize";

const STATUS_CLASS: Record<string, string> = {
  draft: "text-muted-foreground",
  in_review: "text-state-pending",
  approved: "text-trend-up",
  in_progress: "text-primary",
  completed: "text-state-passed",
  rejected: "text-state-failed",
};

export function PlansTab({
  plans,
  projectId,
  kinds,
  title,
  emptyHint,
}: {
  plans: CockpitPlanClient[];
  projectId: string;
  kinds: string[] | null;
  title: string;
  emptyHint: string;
}) {
  const filtered = kinds ? plans.filter((p) => kinds.includes(p.kind)) : plans;
  const newHref = kinds && kinds.length === 1
    ? `/plans/new?projectId=${projectId}&kind=${kinds[0]}`
    : `/plans/new?projectId=${projectId}`;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div>
            <div className="font-display text-base font-semibold">{title}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? "plan" : "plans"}
            </div>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={newHref}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> New
            </Link>
          </Button>
        </div>
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {emptyHint} ·{" "}
            <Link href={newHref} className="text-primary hover:underline">
              Draft one
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {filtered.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <Link href={`/plans/${p.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                  {p.title}
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline" className="px-1.5 py-0 font-mono text-[10px] uppercase">
                    {p.kind}
                  </Badge>
                  <span
                    className={`font-mono text-[10px] uppercase tracking-wide ${STATUS_CLASS[p.status] ?? "text-muted-foreground"}`}
                  >
                    {p.status.replace(/_/g, " ")}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground/70">
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
