"use client";

import { ExternalLink, RefreshCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import type { CockpitDeploymentClient } from "../serialize";

const STATUS_CLASS: Record<CockpitDeploymentClient["status"], string> = {
  pending: "border-muted-foreground/40 text-muted-foreground",
  in_progress: "border-state-pending/40 text-state-pending",
  success: "border-state-passed/40 text-state-passed",
  failed: "border-state-failed/40 text-state-failed",
  rolled_back: "border-trend-down/40 text-trend-down",
};

function formatDuration(start: string, end: string | null): string {
  if (!end) return "in progress";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function CICDTab({ deployments }: { deployments: CockpitDeploymentClient[] }) {
  const byEnv = new Map<string, CockpitDeploymentClient[]>();
  for (const d of deployments) {
    const arr = byEnv.get(d.environment) ?? [];
    arr.push(d);
    byEnv.set(d.environment, arr);
  }
  const environments = Array.from(byEnv.keys()).sort();

  return (
    <div className="space-y-6">
      {environments.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {environments.map((env) => {
            const latest = byEnv.get(env)![0];
            return (
              <Card key={env}>
                <CardContent className="px-4 py-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {env}
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="font-mono text-sm font-medium">{latest.version}</span>
                    <Badge variant="outline" className={`px-1.5 py-0 font-mono text-[10px] uppercase ${STATUS_CLASS[latest.status]}`}>
                      {latest.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground/70">
                    {new Date(latest.startedAt).toLocaleString()}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <RefreshCcw className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="font-display text-base font-semibold">Recent deployments</span>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
              {deployments.length} {deployments.length === 1 ? "event" : "events"}
            </span>
          </div>
          {deployments.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No deployments recorded. CI pipelines post here via the deploy webhook — see{" "}
              <a className="text-primary hover:underline" href="/integrations">
                Integrations
              </a>{" "}
              to wire one up.
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {deployments.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Badge variant="outline" className="shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase">
                    {d.environment}
                  </Badge>
                  <span className="font-mono text-xs">{d.version}</span>
                  {d.commitSha ? (
                    <span className="font-mono text-[10px] text-muted-foreground/80">
                      {d.commitSha.slice(0, 7)}
                    </span>
                  ) : null}
                  <Badge variant="outline" className={`shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase ${STATUS_CLASS[d.status]}`}>
                    {d.status.replace(/_/g, " ")}
                  </Badge>
                  <span className="min-w-0 flex-1 font-mono text-[10px] text-muted-foreground/70">
                    {formatDuration(d.startedAt, d.completedAt ?? d.rolledBackAt)}
                    {d.deployedByName ? <span className="ml-2">· {d.deployedByName}</span> : null}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground/60">
                    {new Date(d.startedAt).toLocaleDateString()}
                  </span>
                  {d.ciRunUrl ? (
                    <a
                      href={d.ciRunUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-muted-foreground/60 hover:text-foreground"
                      aria-label="Open CI run"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
