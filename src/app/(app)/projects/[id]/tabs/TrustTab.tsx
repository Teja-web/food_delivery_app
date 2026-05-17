/**
 * Trust tab — exposes per-project autonomy posture in one place:
 *
 *   1. Active autonomy policy (action × risk matrix; default vs rule-overridden)
 *   2. Recent skill outcomes for this project
 *
 * Closes UI-audit items P1.5 (per-project outcomes) and P1.7 (inline
 * policy on cockpit). Pure read; no server actions; no writes.
 */

import { CircleCheck, CircleX, Undo2 } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SkillOutcomeVerdict } from "@/db/schema/skill-outcome";
import { cn } from "@/lib/utils";

import type {
  ProjectOutcomeRow,
  PolicyMatrixCell,
} from "@/operations/project-trust";

const VERDICT_META: Record<
  SkillOutcomeVerdict,
  { label: string; tone: string; Icon: typeof CircleCheck }
> = {
  success: { label: "success", tone: "border-trend-up/40 text-trend-up", Icon: CircleCheck },
  rolled_back: {
    label: "rolled back",
    tone: "border-state-pending/40 text-state-pending",
    Icon: Undo2,
  },
  incident: {
    label: "incident",
    tone: "border-state-failed/40 text-state-failed",
    Icon: CircleX,
  },
};

const LEVEL_TONE: Record<PolicyMatrixCell["minLevelDisplay"], string> = {
  observe: "border-autonomy-intern/40 bg-autonomy-intern/10 text-autonomy-intern",
  propose: "border-autonomy-junior/40 bg-autonomy-junior/10 text-autonomy-junior",
  merge: "border-autonomy-senior/40 bg-autonomy-senior/10 text-autonomy-senior",
  lead: "border-autonomy-principal/40 bg-autonomy-principal/10 text-autonomy-principal",
  never: "border-state-failed/40 bg-state-failed/10 text-state-failed",
};

const ACTION_LABEL: Record<PolicyMatrixCell["actionKind"], string> = {
  merge_pr: "Merge PR",
  advance_phase_gate: "Advance phase gate",
  co_sign_promotion: "Co-sign promotion",
  deploy_production: "Deploy to production",
};

const RISK_LABEL: Record<PolicyMatrixCell["changeRisk"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

function formatAge(date: Date): string {
  const ms = Date.now() - date.getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function ActivePolicyMatrix({ cells }: { cells: PolicyMatrixCell[] }) {
  // Group cells by action → array of risks
  const byAction = new Map<PolicyMatrixCell["actionKind"], PolicyMatrixCell[]>();
  for (const c of cells) {
    const arr = byAction.get(c.actionKind) ?? [];
    arr.push(c);
    byAction.set(c.actionKind, arr);
  }

  const overrideCount = cells.filter((c) => c.source !== "default").length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <span>Active autonomy policy</span>
          <span className="text-[10px] normal-case tracking-normal text-muted-foreground/80">
            {overrideCount > 0
              ? `${overrideCount} rule-overridden cell${overrideCount === 1 ? "" : "s"}`
              : "all defaults"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="mb-3 text-xs text-muted-foreground">
          For each (action, risk) pair the execution gate asks the rule engine for the minimum
          autonomy required, falling back to a default table when no <code className="font-mono">
            autonomy-threshold
          </code>{" "}
          rule matches. Cells with a rule override show the rule id.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Action
                </th>
                {(["low", "medium", "high", "critical"] as const).map((r) => (
                  <th
                    key={r}
                    className="px-2 py-2 text-center font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
                  >
                    {RISK_LABEL[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Array.from(byAction.keys()) as PolicyMatrixCell["actionKind"][]).map((action) => {
                const rowCells = byAction.get(action) ?? [];
                const byRisk = new Map(rowCells.map((c) => [c.changeRisk, c]));
                return (
                  <tr key={action} className="border-b border-border/40">
                    <td className="px-3 py-2 text-xs">{ACTION_LABEL[action]}</td>
                    {(["low", "medium", "high", "critical"] as const).map((risk) => {
                      const cell = byRisk.get(risk);
                      if (!cell) {
                        return (
                          <td key={risk} className="px-2 py-2 text-center">
                            <span className="text-muted-foreground/40">—</span>
                          </td>
                        );
                      }
                      return (
                        <td key={risk} className="px-2 py-2 text-center">
                          <Badge
                            variant="outline"
                            className={cn(
                              "inline-flex flex-col items-stretch gap-0.5 px-1.5 py-0.5 font-mono text-[10px]",
                              LEVEL_TONE[cell.minLevelDisplay],
                            )}
                            title={
                              cell.enforcedByRuleId
                                ? `Source: ${cell.source} (rule ${cell.enforcedByRuleId})`
                                : `Source: ${cell.source}`
                            }
                          >
                            <span className="uppercase">{cell.minLevelDisplay}</span>
                            <span className="text-[9px] opacity-70">
                              {cell.source === "default"
                                ? "default"
                                : cell.source === "rule:project"
                                  ? "project"
                                  : "org"}
                            </span>
                          </Badge>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground/80">
          Override a cell by authoring an <code className="font-mono">autonomy-threshold</code>{" "}
          rule from{" "}
          <Link href="/rules" className="underline hover:text-foreground">
            /rules
          </Link>
          . Project-scoped rules win over org-scoped rules win over defaults.
        </p>
      </CardContent>
    </Card>
  );
}

function RecentOutcomes({ outcomes }: { outcomes: ProjectOutcomeRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <span>Recent outcomes · {outcomes.length}</span>
          <Link
            href="/audit?scope=skills"
            className="text-[10px] normal-case tracking-normal text-muted-foreground hover:text-foreground"
          >
            open audit log →
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {outcomes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No skill outcomes for this project yet. Outcomes appear here as the autonomy ledger
            records them — either AI-invoked or via the deterministic assessors (PR merge, deploy).
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {outcomes.map((o) => {
              const meta = VERDICT_META[o.verdict];
              return (
                <li key={o.id} className="flex items-center gap-3 py-1.5 first:pt-0 last:pb-0">
                  <meta.Icon
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      meta.tone.split(" ").find((c) => c.startsWith("text-")),
                    )}
                    aria-hidden
                  />
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase",
                      meta.tone,
                    )}
                  >
                    {meta.label}
                  </Badge>
                  {o.severity ? (
                    <Badge
                      variant="outline"
                      className="shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase text-muted-foreground"
                    >
                      {o.severity}
                    </Badge>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground/85">
                    {o.skillId && o.skillName ? (
                      <Link
                        href={`/skills/${o.skillId}`}
                        className="hover:underline"
                      >
                        {o.skillName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{o.skillSlug ?? "unknown skill"}</span>
                    )}
                    {o.sourceRef ? (
                      <span className="ml-2 font-mono text-[10px] text-muted-foreground/70">
                        {o.sourceRef}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                    {o.sourceKind}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                    {formatAge(o.recordedAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function TrustTab({
  outcomes,
  policy,
}: {
  outcomes: ProjectOutcomeRow[];
  policy: PolicyMatrixCell[];
}) {
  return (
    <div className="space-y-6">
      <ActivePolicyMatrix cells={policy} />
      <RecentOutcomes outcomes={outcomes} />
    </div>
  );
}
