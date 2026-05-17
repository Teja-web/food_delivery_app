"use client";

import Link from "next/link";
import { FileText, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import type { CockpitPlanClient, CockpitWorkItemClient } from "../serialize";

const DOC_KINDS = new Set(["adr", "release_plan", "test_plan", "incident", "runbook"]);

const KIND_LABEL: Record<string, string> = {
  adr: "Decision",
  release_plan: "Release plan",
  test_plan: "Test plan",
  incident: "Incident report",
  runbook: "Runbook",
};

export function DocumentsTab({
  plans,
  workItems,
}: {
  plans: CockpitPlanClient[];
  workItems: CockpitWorkItemClient[];
}) {
  const docs = plans.filter((p) => DOC_KINDS.has(p.kind));
  const confluencePages = workItems.filter((w) => w.source === "confluence");

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="font-display text-base font-semibold">Decision records & plans</span>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
              {docs.length} {docs.length === 1 ? "document" : "documents"}
            </span>
          </div>
          {docs.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No ADRs, runbooks, or release plans yet. Author one as a plan.
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {docs.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <Link href={`/plans/${p.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                    {p.title}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className="px-1.5 py-0 font-mono text-[10px] uppercase">
                      {KIND_LABEL[p.kind] ?? p.kind}
                    </Badge>
                    <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      {p.status.replace(/_/g, " ")}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground/70">
                      {new Date(p.updatedAt).toLocaleDateString()}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {confluencePages.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <span className="font-display text-base font-semibold">Confluence pages</span>
              <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
                {confluencePages.length} synced
              </span>
            </div>
            <ul className="divide-y divide-border/40">
              {confluencePages.map((w) => (
                <li key={w.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Badge variant="outline" className="shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase">
                    confluence
                  </Badge>
                  <a
                    href={w.externalUrl ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate hover:underline"
                  >
                    {w.title}
                  </a>
                  {w.externalUrl ? (
                    <a
                      href={w.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground/60 hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
