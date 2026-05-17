"use client";

import { CircleAlert, CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { CockpitClient as CockpitData, CockpitGateClient } from "../serialize";

function StatusDot({ status }: { status: CockpitGateClient["status"] }) {
  const map = {
    passed: <CircleCheck className="h-3.5 w-3.5 text-state-passed" />,
    failed: <CircleX className="h-3.5 w-3.5 text-state-failed" />,
    pending: <CircleDashed className="h-3.5 w-3.5 text-state-pending" />,
    skipped: <CircleAlert className="h-3.5 w-3.5 text-muted-foreground/60" />,
  };
  return map[status];
}

const PHASE_ORDER: CockpitData["project"]["phase"][] = [
  "requirements",
  "design",
  "development",
  "testing",
  "cicd",
  "monitoring",
];

export function PhasesTab({ data }: { data: CockpitData }) {
  const { project, gatesByPhase } = data;
  const currentIdx = PHASE_ORDER.indexOf(project.phase);

  return (
    <div className="space-y-6">
      {/* Linear progress strip */}
      <Card>
        <CardContent className="px-6 py-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Pipeline progression
          </div>
          <ol className="mt-4 grid grid-cols-6 gap-1">
            {gatesByPhase.map((g, idx) => {
              const isCurrent = idx === currentIdx;
              const isPast = idx < currentIdx;
              const isFuture = idx > currentIdx;
              const cleared = g.gates.filter((x) => x.status === "passed" || x.status === "skipped").length;
              const total = g.gates.length;

              return (
                <li key={g.phase} className="flex flex-col gap-1.5">
                  <div
                    className={cn(
                      "h-1.5 rounded-full",
                      isPast && "bg-state-passed",
                      isCurrent && "bg-primary",
                      isFuture && "bg-border",
                    )}
                  />
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={cn(
                        "font-mono text-[10px] uppercase tracking-wide",
                        isPast && "text-state-passed",
                        isCurrent && "text-foreground font-semibold",
                        isFuture && "text-muted-foreground/60",
                      )}
                    >
                      {g.label}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground/70">
                      {total > 0 ? `${cleared}/${total}` : "—"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      {/* Per-phase gates */}
      <div className="space-y-4">
        {gatesByPhase.map((g, idx) => {
          const isCurrent = idx === currentIdx;
          const isPast = idx < currentIdx;
          return (
            <Card
              key={g.phase}
              className={cn(
                "border",
                isCurrent && "border-primary/40 bg-card/60",
                isPast && "opacity-80",
              )}
            >
              <CardContent className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-sm font-semibold">{g.label}</span>
                    {isCurrent && (
                      <Badge variant="outline" className="border-primary/40 px-1.5 py-0 font-mono text-[10px] uppercase text-primary">
                        Current
                      </Badge>
                    )}
                    {isPast && (
                      <Badge variant="outline" className="border-state-passed/40 px-1.5 py-0 font-mono text-[10px] uppercase text-state-passed">
                        Completed
                      </Badge>
                    )}
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
                    {g.gates.length} {g.gates.length === 1 ? "gate" : "gates"}
                  </span>
                </div>
                {g.gates.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    No gates configured — advancement from this phase is unrestricted.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1.5">
                    {g.gates.map((gate) => (
                      <li key={gate.id} className="flex items-start gap-2.5 text-sm">
                        <StatusDot status={gate.status} />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{gate.name}</span>{" "}
                          <Badge variant="outline" className="ml-1 px-1.5 py-0 font-mono text-[10px] uppercase">
                            {gate.type}
                          </Badge>
                          {gate.unmetCriterion && (gate.status === "pending" || gate.status === "failed") ? (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {gate.unmetCriterion}
                              {gate.assigneeName ? <span className="ml-1 text-foreground/80">@{gate.assigneeName}</span> : null}
                              {gate.ageLabel ? <span className="ml-1 opacity-70">({gate.ageLabel})</span> : null}
                            </div>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
