"use client";

import { Check, CircleAlert, CircleCheck, CircleDashed, CircleX, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type {
  CockpitBindingClient,
  CockpitGateClient,
  CockpitProjectClient,
} from "../serialize";
import type { PhaseGuidance } from "@/domain/phases";
import type { ProjectPhase } from "@/db/schema/project";

const PHASE_LABEL: Record<CockpitProjectClient["phase"], string> = {
  requirements: "REQUIREMENTS",
  design: "DESIGN",
  development: "DEVELOPMENT",
  testing: "TESTING",
  cicd: "CI/CD",
  monitoring: "MONITORING",
};

function GateIcon({ status }: { status: CockpitGateClient["status"] }) {
  const map = {
    passed: <CircleCheck className="h-4 w-4 text-state-passed" aria-hidden />,
    failed: <CircleX className="h-4 w-4 text-state-failed" aria-hidden />,
    pending: <CircleDashed className="h-4 w-4 text-state-pending" aria-hidden />,
    skipped: <CircleAlert className="h-4 w-4 text-muted-foreground/60" aria-hidden />,
  };
  return map[status];
}

function GateRow({ gate }: { gate: CockpitGateClient }) {
  const failedOrPending = gate.status === "failed" || gate.status === "pending";
  return (
    <li className="flex items-start gap-3 border-b border-border/40 px-3 py-2 last:border-0">
      <GateIcon status={gate.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{gate.name}</span>
          <Badge variant="outline" className="px-1.5 py-0 font-mono text-[10px] uppercase">
            {gate.type}
          </Badge>
        </div>
        {failedOrPending && gate.unmetCriterion ? (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {gate.unmetCriterion}
            {gate.assigneeName ? (
              <span className="ml-1 text-foreground/80">@{gate.assigneeName}</span>
            ) : null}
            {gate.ageLabel ? <span className="ml-1 opacity-70">({gate.ageLabel})</span> : null}
          </div>
        ) : null}
        {gate.status === "failed" && gate.lastGreenAt ? (
          <div className="mt-0.5 text-[11px] text-trend-down/80">
            Was green {new Date(gate.lastGreenAt).toLocaleDateString()} — what changed?
          </div>
        ) : null}
      </div>
    </li>
  );
}

export interface OverviewTabProps {
  project: Pick<CockpitProjectClient, "slug" | "createdAt">;
  guidance: PhaseGuidance;
  gates: CockpitGateClient[];
  gatesAllPassed: boolean;
  nextPhase: ProjectPhase | null;
  canAdvance: boolean;
  blockedReason: string | null;
  bindings: CockpitBindingClient[];
}

export function OverviewTab({
  project,
  guidance,
  gates,
  gatesAllPassed,
  nextPhase,
  canAdvance,
  blockedReason,
  bindings,
}: OverviewTabProps) {
  return (
    <div className="space-y-6">
      <Card className="border-primary/30 bg-card/60">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              This phase · {guidance.label}
            </CardTitle>
            {nextPhase ? (
              <Button
                size="sm"
                disabled={!canAdvance}
                className={cn(gatesAllPassed && "shadow-sm")}
                title={blockedReason ?? undefined}
              >
                Advance to {PHASE_LABEL[nextPhase].toLowerCase()} →
              </Button>
            ) : (
              <Badge variant="outline" className="text-trend-up">
                Terminal phase
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <p className="text-sm text-foreground/85">{guidance.description}</p>
          <div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Suggested actions
            </div>
            <ul className="space-y-1 text-sm">
              {guidance.suggestedActions.map((a) => (
                <li key={a} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/60" />
                  <span className="text-foreground/85">{a}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-trend-up/30 bg-trend-up/[0.04] px-3 py-2">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-trend-up/85">
                Allowed for agents
              </div>
              <ul className="space-y-1 text-xs">
                {guidance.allowed.map((a) => (
                  <li key={a} className="flex items-start gap-1.5 text-foreground/85">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-trend-up" aria-hidden />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border border-state-failed/30 bg-state-failed/[0.04] px-3 py-2">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-state-failed/85">
                Forbidden in this phase
              </div>
              <ul className="space-y-1 text-xs">
                {guidance.forbidden.map((a) => (
                  <li key={a} className="flex items-start gap-1.5 text-muted-foreground">
                    <X className="mt-0.5 h-3 w-3 shrink-0 text-state-failed/80" aria-hidden />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Next phase opens when
            </span>
            <div className="mt-0.5 text-xs text-foreground/85">{guidance.nextCondition}</div>
          </div>
          {blockedReason ? (
            <div className="rounded-md border border-state-failed/40 bg-state-failed/10 px-3 py-2 text-xs text-state-failed">
              Blocked: {blockedReason}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Gates · {gates.filter((g) => g.status === "passed" || g.status === "skipped").length}/{gates.length} cleared
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {gates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No gates configured for this phase — advancement is allowed.
              </p>
            ) : (
              <ul className="divide-y-0 rounded-md border">
                {gates.map((g) => (
                  <GateRow key={g.id} gate={g} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Connected systems · {bindings.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {bindings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No bindings — connect an adapter from <a className="text-primary hover:underline" href="/integrations">Integrations</a>.
              </p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {bindings.map((b) => (
                  <li key={b.id} className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2">
                      <Badge variant="outline" className="px-1.5 py-0 font-mono text-[10px] uppercase">
                        {b.provider}
                      </Badge>
                      <span className="font-mono text-[11px] text-muted-foreground">{b.externalKey}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="text-[11px] font-mono text-muted-foreground/70">
        Project {project.slug} · created {new Date(project.createdAt).toLocaleDateString()}
      </div>
    </div>
  );
}
