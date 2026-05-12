"use client";

import {
  ChevronLeft,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  ExternalLink,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { ConnectCursorModal } from "./ConnectCursorModal";
import type { CockpitClient as CockpitData, CockpitGateClient } from "./serialize";

const PHASE_LABEL: Record<CockpitData["project"]["phase"], string> = {
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

export function CockpitClient({ data }: { data: CockpitData }) {
  const [cursorOpen, setCursorOpen] = useState(false);
  const { project, guidance, gates, gatesAllPassed, plans, bindings, nextPhase, canAdvance, blockedReason } = data;

  return (
    <div className="space-y-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Portfolio
      </Link>

      <header className="flex items-start justify-between gap-6 border-b pb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {project.name}
            </h1>
            <Badge
              variant="outline"
              className="border-state-pending/40 px-1.5 py-0 font-mono text-[10px] uppercase tracking-wide text-state-pending"
            >
              {PHASE_LABEL[project.phase]}
            </Badge>
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {project.slug} · created {new Date(project.createdAt).toLocaleDateString()}
            {project.repoUrl ? (
              <>
                <span className="mx-2 opacity-40">·</span>
                <a
                  href={project.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  repo <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCursorOpen(true)}>
            Connect Cursor
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/plans/new?projectId=${project.id}`}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> New plan
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
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
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Adapter bindings
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {bindings.length === 0 ? (
                <Link
                  href="/integrations"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  No bindings · + Bind a provider
                </Link>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {bindings.map((b) => (
                    <li key={b.id} className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="px-1.5 py-0 font-mono text-[10px] uppercase"
                        >
                          {b.provider}
                        </Badge>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {b.externalKey}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Plans · {plans.length}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {plans.length === 0 ? (
                <Link
                  href={`/plans/new?projectId=${project.id}`}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  No plans yet · + Draft a plan
                </Link>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {plans.slice(0, 8).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <Link href={`/plans/${p.id}`} className="min-w-0 truncate hover:underline">
                        {p.title}
                      </Link>
                      <Badge
                        variant="outline"
                        className="shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase"
                      >
                        {p.kind}
                      </Badge>
                    </li>
                  ))}
                  {plans.length > 8 ? (
                    <li className="pt-1 text-xs text-muted-foreground">
                      + {plans.length - 8} more
                    </li>
                  ) : null}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConnectCursorModal
        open={cursorOpen}
        onOpenChange={setCursorOpen}
        projectSlug={project.slug}
        apiKeyPrefix={data.apiKey.prefix}
        apiKeyPlaintext={data.apiKey.plaintext}
        isNewKey={data.apiKey.isNew}
      />
    </div>
  );
}
