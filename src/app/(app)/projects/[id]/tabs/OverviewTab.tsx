"use client";

import { Activity, ScrollText, ShieldAlert, Sparkles } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { CockpitBindingClient } from "../serialize";

export interface PendingGovernanceRow {
  id: string;
  kind: string;
  planArtifactId: string;
  planTitle: string | null;
  createdAtIso: string;
}

export interface ProjectPulse {
  plansTotal: number;
  plansInReview: number;
  plansInProgress: number;
  governancePending: number;
  outcomes30d: number;
  incidents7d: number;
}

export interface OverviewTabProps {
  projectId: string;
  projectName: string;
  pulse: ProjectPulse;
  pendingGovernance: PendingGovernanceRow[];
  bindings: CockpitBindingClient[];
}

function StatTile({
  label,
  value,
  Icon,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  Icon: typeof Activity;
  hint?: string;
  tone?: "warn" | "default";
}) {
  return (
    <Card className="bg-card/40">
      <CardContent className="space-y-1 pt-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </span>
          <Icon
            className={`h-3.5 w-3.5 ${tone === "warn" ? "text-state-failed" : "text-muted-foreground"}`}
            aria-hidden
          />
        </div>
        <div className="flex items-baseline gap-2">
          <span
            className={`font-display text-2xl font-bold tabular-nums ${
              tone === "warn" ? "text-state-failed" : ""
            }`}
          >
            {value}
          </span>
          {hint ? (
            <span className="font-mono text-[10px] text-muted-foreground">{hint}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Project pulse — replaces the old phase/gates-driven overview.
 * Surfaces plan activity, governance backlog, and recent autonomy outcomes.
 */
export function OverviewTab({
  projectId,
  projectName,
  pulse,
  pendingGovernance,
  bindings,
}: OverviewTabProps) {
  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display text-lg font-semibold">{projectName}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Project pulse — plans, governance backlog, and recent outcomes.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Plans"
          value={pulse.plansTotal}
          Icon={ScrollText}
          hint={pulse.plansInReview > 0 ? `${pulse.plansInReview} in review` : undefined}
        />
        <StatTile
          label="In progress"
          value={pulse.plansInProgress}
          Icon={Activity}
        />
        <StatTile
          label="Governance pending"
          value={pulse.governancePending}
          Icon={ShieldAlert}
          tone={pulse.governancePending > 0 ? "warn" : "default"}
        />
        <StatTile
          label="Outcomes 30d"
          value={pulse.outcomes30d}
          Icon={Sparkles}
          hint={
            pulse.incidents7d > 0
              ? `${pulse.incidents7d} incident${pulse.incidents7d === 1 ? "" : "s"} 7d`
              : undefined
          }
          tone={pulse.incidents7d > 0 ? "warn" : "default"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Top blockers · pending governance
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {pendingGovernance.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending governance records.</p>
            ) : (
              <ul className="divide-y rounded border text-sm">
                {pendingGovernance.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-3 py-2">
                    <Link
                      href={`/plans/${r.planArtifactId}`}
                      className="min-w-0 truncate hover:underline"
                    >
                      <span className="mr-2 font-mono text-[10px] uppercase text-muted-foreground">
                        {r.kind}
                      </span>
                      {r.planTitle ?? r.planArtifactId.slice(0, 8)}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.createdAtIso).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex justify-end">
              <Link
                href={`/projects/${projectId}/governance/inbox`}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Open governance inbox →
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Adapters
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {bindings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No adapters bound yet.{" "}
                <Link
                  href="/integrations"
                  className="text-foreground hover:underline"
                >
                  Connect one →
                </Link>
              </p>
            ) : (
              <ul className="space-y-1">
                {bindings.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px] uppercase">
                        {b.provider}
                      </Badge>
                      <span className="text-muted-foreground">{b.externalKey}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(b.updatedAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
