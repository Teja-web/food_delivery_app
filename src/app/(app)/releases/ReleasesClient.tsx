"use client";

import Link from "next/link";
import { CircleAlert, ExternalLink, Rocket } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import type { ReleaseDeploymentClient, ReleasePlanClient, ReleasesPageData } from "./serialize";

const PLAN_STATUS_CLASS: Record<string, string> = {
  draft: "text-muted-foreground",
  in_review: "text-state-pending",
  approved: "text-trend-up",
  in_progress: "text-primary",
  completed: "text-state-passed",
  rejected: "text-state-failed",
};

const DEPLOY_STATUS_CLASS: Record<ReleaseDeploymentClient["status"], string> = {
  pending: "border-muted-foreground/40 text-muted-foreground",
  in_progress: "border-state-pending/40 text-state-pending",
  success: "border-state-passed/40 text-state-passed",
  failed: "border-state-failed/40 text-state-failed",
  rolled_back: "border-trend-down/40 text-trend-down",
};

function PlanRow({ p }: { p: ReleasePlanClient }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <Link
        href={`/projects/${p.projectId}`}
        className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
        title={p.projectName}
      >
        {p.projectSlug || p.projectName.slice(0, 16)}
      </Link>
      <Link href={`/plans/${p.id}`} className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm hover:underline">
        {p.needsApproval ? (
          <CircleAlert className="h-3.5 w-3.5 shrink-0 text-state-pending" aria-label="Needs approval" />
        ) : null}
        <span className="truncate">{p.title}</span>
      </Link>
      {p.priority ? (
        <Badge variant="outline" className="px-1.5 py-0 font-mono text-[10px] uppercase">
          {p.priority}
        </Badge>
      ) : null}
      <span
        className={`font-mono text-[10px] uppercase tracking-wide ${PLAN_STATUS_CLASS[p.status] ?? "text-muted-foreground"}`}
      >
        {p.status.replace(/_/g, " ")}
      </span>
      {p.dueDate ? (
        <span
          className="font-mono text-[10px] text-muted-foreground/70"
          title="Due date"
        >
          due {new Date(p.dueDate).toLocaleDateString()}
        </span>
      ) : null}
    </li>
  );
}

function DeployRow({ d }: { d: ReleaseDeploymentClient }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 text-sm">
      <Link
        href={`/projects/${d.projectId}`}
        className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        {d.projectName.slice(0, 24)}
      </Link>
      <Badge variant="outline" className="shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase">
        {d.environment}
      </Badge>
      <span className="font-mono text-xs">{d.version}</span>
      <Badge variant="outline" className={`shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase ${DEPLOY_STATUS_CLASS[d.status]}`}>
        {d.status.replace(/_/g, " ")}
      </Badge>
      <span className="min-w-0 flex-1 font-mono text-[10px] text-muted-foreground/70">
        {d.deployedByName ?? "automated"}
      </span>
      <span className="font-mono text-[10px] text-muted-foreground/70">
        {new Date(d.startedAt).toLocaleDateString()}
      </span>
    </li>
  );
}

export function ReleasesClient({ data }: { data: ReleasesPageData }) {
  const { plans, recentDeployments } = data;
  const active = plans.filter((p) => p.status !== "completed" && p.status !== "rejected");
  const completed = plans.filter((p) => p.status === "completed");
  const activeNeedsApproval = active.filter((p) => p.needsApproval).length;

  return (
    <div className="space-y-6">
      <header className="space-y-1.5 border-b pb-5">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" aria-hidden />
          <h1 className="font-display text-2xl font-semibold tracking-tight">Releases</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Release plans in flight, recent deployments across all projects, and the link between them.
        </p>
      </header>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <span className="font-display text-base font-semibold">Active release plans</span>
            <span className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
              {activeNeedsApproval > 0 ? (
                <span className="inline-flex items-center gap-1 text-state-pending">
                  <CircleAlert className="h-3 w-3" aria-hidden />
                  {activeNeedsApproval} needs approval
                </span>
              ) : null}
              <span>
                {active.length} {active.length === 1 ? "plan" : "plans"}
              </span>
            </span>
          </div>
          {active.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No active release plans. Author one as a plan with kind={" "}
              <code className="font-mono text-foreground/85">release_plan</code>.
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {active.map((p) => (
                <PlanRow key={p.id} p={p} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <span className="font-display text-base font-semibold">Recent deployments</span>
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
              {recentDeployments.length} events
            </span>
          </div>
          {recentDeployments.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No deployments recorded yet.
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {recentDeployments.map((d) => (
                <DeployRow key={d.id} d={d} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {completed.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <span className="font-display text-base font-semibold">Completed releases</span>
              <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
                {completed.length} {completed.length === 1 ? "plan" : "plans"}
              </span>
            </div>
            <ul className="divide-y divide-border/40">
              {completed.map((p) => (
                <PlanRow key={p.id} p={p} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="text-[11px] font-mono text-muted-foreground/70">
        Tip — release plans link to deployments via{" "}
        <code className="font-mono text-foreground/85">deployments.plan_id</code>. Tag your CI deploy
        with the plan id to attribute deployments back here.
        <ExternalLink className="ml-1 inline h-3 w-3" />
      </div>
    </div>
  );
}
