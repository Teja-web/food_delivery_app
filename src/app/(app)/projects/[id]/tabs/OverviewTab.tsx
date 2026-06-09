"use client";

import {
  Activity,
  ArrowRight,
  BadgeCheck,
  FileCheck,
  FileWarning,
  ScrollText,
  Shield,
  Sparkles,
  Workflow,
} from "lucide-react";
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
  /** Plans completed within the trailing 30d that have no expected evidence attached. */
  verificationDebt: number;
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

type PulseItem = { Icon: typeof Activity; label: string; desc: string };

const PULSE_GUIDE: { pillar: string; items: PulseItem[] }[] = [
  {
    pillar: "Govern",
    items: [
      {
        Icon: ScrollText,
        label: "Plans",
        desc: "Every plan artifact authored against this project — epics, features, ADRs, specs, incidents.",
      },
      {
        Icon: Workflow,
        label: "In progress",
        desc: "Plans actively moving from approved to delivered.",
      },
      {
        Icon: Shield,
        label: "Governance pending",
        desc: "Gates, approvals, reviews, and exceptions waiting on a decision.",
      },
    ],
  },
  {
    pillar: "Verify",
    items: [
      {
        Icon: Sparkles,
        label: "Skills & autonomy",
        desc: "AI skills earn autonomy per project on a four-rung ladder — observe → propose → merge → lead — recomputed from a 30-day window of outcomes.",
      },
      {
        Icon: BadgeCheck,
        label: "Outcomes 30d",
        desc: "Verdicts on skill invocations — successes, rollbacks, incidents — joined with deterministic assessors (PR merge, deploy clean, revert).",
      },
      {
        Icon: Activity,
        label: "DORA metrics",
        desc: "Deploy frequency, lead time, change-failure rate, and MTTR — rolled up from your connected adapters.",
      },
    ],
  },
  {
    pillar: "Trust",
    items: [
      {
        Icon: FileWarning,
        label: "Verification debt",
        desc: "Plans marked complete without the evidence they promised — coznt's load-bearing trust signal.",
      },
      {
        Icon: FileCheck,
        label: "Audit log",
        desc: "A hash-chained, tamper-evident record of every governance decision and state change on this project.",
      },
    ],
  },
];

/**
 * Project pulse — replaces the old phase/gates-driven overview.
 * Surfaces plan activity, governance backlog, and recent autonomy outcomes.
 */
export function OverviewTab({
  projectId,
  projectName: _projectName,
  pulse,
  pendingGovernance,
  bindings,
}: OverviewTabProps) {
  const isFresh =
    pulse.plansTotal === 0 &&
    pulse.governancePending === 0 &&
    pulse.outcomes30d === 0 &&
    pendingGovernance.length === 0 &&
    bindings.length === 0;

  if (isFresh) {
    return (
      <div className="space-y-10 py-4">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border/60 bg-background/50">
              <Sparkles
                className="h-5 w-5 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
            </div>
            <h3 className="font-display text-xl font-semibold text-foreground">
              The heartbeat of this project
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Project pulse surfaces plan activity, governance load, and
              recent outcomes in one glance. It lights up as soon as work
              starts flowing through coznt.
            </p>
            <div className="flex items-center gap-3 pt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
              <span>Govern</span>
              <span className="h-px w-3 bg-border" aria-hidden />
              <span>Verify</span>
              <span className="h-px w-3 bg-border" aria-hidden />
              <span>Trust</span>
            </div>
          </div>

          <div className="space-y-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
              What coznt tracks in this project
            </p>
            {PULSE_GUIDE.map(({ pillar, items }) => (
              <div key={pillar} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-foreground/85">
                    {pillar}
                  </span>
                  <span className="h-px flex-1 bg-border/60" aria-hidden />
                </div>
                <ul className="space-y-3">
                  {items.map(({ Icon, label, desc }) => (
                    <li key={label} className="flex gap-3">
                      <Icon
                        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-foreground">
                          {label}
                        </p>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {desc}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border/60 pt-6 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground">Ready to light it up?</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href="/integrations"
              className="inline-flex items-center gap-1 text-foreground hover:underline"
            >
              Connect an adapter
              <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
            <span className="text-muted-foreground/40" aria-hidden>
              ·
            </span>
            <Link
              href={`/projects/${projectId}/plans`}
              className="inline-flex items-center gap-1 text-foreground hover:underline"
            >
              Author a plan
              <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
            <span className="text-muted-foreground/40" aria-hidden>
              ·
            </span>
            <Link
              href={`/projects/${projectId}/governance`}
              className="inline-flex items-center gap-1 text-foreground hover:underline"
            >
              Open governance
              <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
            <span className="text-muted-foreground/40" aria-hidden>
              ·
            </span>
            <Link
              href="/skills"
              className="inline-flex items-center gap-1 text-foreground hover:underline"
            >
              Browse skills
              <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
        Project pulse — plans, governance backlog, recent outcomes
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          label="Plans"
          value={pulse.plansTotal}
          Icon={ScrollText}
          hint={pulse.plansInReview > 0 ? `${pulse.plansInReview} in review` : undefined}
        />
        <StatTile
          label="In progress"
          value={pulse.plansInProgress}
          Icon={Workflow}
        />
        <StatTile
          label="Governance pending"
          value={pulse.governancePending}
          Icon={Shield}
          tone={pulse.governancePending > 0 ? "warn" : "default"}
        />
        <StatTile
          label="Verification debt"
          value={pulse.verificationDebt}
          Icon={FileWarning}
          hint="30d, no evidence"
          tone={pulse.verificationDebt > 0 ? "warn" : "default"}
        />
        <StatTile
          label="Outcomes 30d"
          value={pulse.outcomes30d}
          Icon={BadgeCheck}
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
