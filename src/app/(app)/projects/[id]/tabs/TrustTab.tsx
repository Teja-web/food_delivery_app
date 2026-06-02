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
import type { SkillOutcomeVerdict } from "@/db/schema/skill/skill-outcome";
import { cn } from "@/lib/utils";

import type { ProjectLearning } from "@/db/schema/plan/project-learning";
import type {
  ProjectOutcomeRow,
  PolicyMatrixCell,
} from "@/operations/project/project-trust";

import { LearningsCard } from "./LearningsCard";
import { MergeApprovalPolicyCard } from "./MergeApprovalPolicyCard";

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
  observe: "border-autonomy-observe/40 bg-autonomy-observe/10 text-autonomy-observe",
  propose: "border-autonomy-propose/40 bg-autonomy-propose/10 text-autonomy-propose",
  merge: "border-autonomy-merge/40 bg-autonomy-merge/10 text-autonomy-merge",
  lead: "border-autonomy-lead/40 bg-autonomy-lead/10 text-autonomy-lead",
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

const TIER_TONE: Record<"GOOD" | "NEEDS_IMPROVEMENT" | "POOR", string> = {
  GOOD: "border-trend-up/40 text-trend-up",
  NEEDS_IMPROVEMENT: "border-state-pending/40 text-state-pending",
  POOR: "border-state-failed/40 text-state-failed",
};

interface PromptQualitySummary {
  attenuationFactor: number;
  distribution: { good: number; needsImprovement: number; poor: number; total: number };
  recent: Array<{
    id: string;
    role: "USER" | "ASSISTANT" | "SYSTEM";
    source: string;
    content: string;
    promptScore: number | null;
    promptTier: "GOOD" | "NEEDS_IMPROVEMENT" | "POOR" | null;
    authorName: string | null;
    createdAt: string;
  }>;
}

function PromptQualityCard({
  data,
  projectId,
}: {
  data: PromptQualitySummary | null;
  projectId: string;
}) {
  if (!data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Prompt quality
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">
            Prompt governance is disabled for this deployment. Set{" "}
            <code className="font-mono text-xs">COZNT_PROMPT_GOVERNANCE_ENABLED=1</code>{" "}
            to capture and grade developer prompts.
          </p>
        </CardContent>
      </Card>
    );
  }
  if (data.distribution.total === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Prompt quality
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">
            No prompts captured yet. Install the Claude Code hook via{" "}
            <code className="font-mono text-xs">coznt connect --install-prompt-hook</code>{" "}
            to start scoring prompts.
          </p>
        </CardContent>
      </Card>
    );
  }
  const { good, needsImprovement, poor, total } = data.distribution;
  const goodPct = Math.round((good / total) * 100);
  const niPct = Math.round((needsImprovement / total) * 100);
  const poorPct = 100 - goodPct - niPct;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <span>Prompt quality · 30d · {total} prompts</span>
          <span className="text-[10px] normal-case tracking-normal text-muted-foreground">
            promotion ×{data.attenuationFactor.toFixed(2)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex h-2 w-full overflow-hidden rounded bg-muted">
          <div className="bg-trend-up" style={{ width: `${goodPct}%` }} />
          <div className="bg-state-pending" style={{ width: `${niPct}%` }} />
          <div className="bg-state-failed" style={{ width: `${poorPct}%` }} />
        </div>
        <div className="flex gap-4 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>good {goodPct}%</span>
          <span>needs {niPct}%</span>
          <span>poor {poorPct}%</span>
        </div>
        <ul className="divide-y divide-border/40">
          {data.recent.slice(0, 10).map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-1.5 first:pt-0 last:pb-0">
              {p.promptTier ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase",
                    TIER_TONE[p.promptTier],
                  )}
                >
                  {p.promptScore ?? "—"}
                </Badge>
              ) : (
                <Badge variant="outline" className="shrink-0 px-1.5 py-0 font-mono text-[10px]">
                  pending
                </Badge>
              )}
              <Link
                href={`/projects/${projectId}/prompts/${p.id}`}
                className="min-w-0 flex-1 truncate text-xs text-foreground/85 hover:underline"
              >
                {p.content}
              </Link>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                {p.source}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                {p.authorName ?? "—"}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                {formatAge(new Date(p.createdAt))}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function TrustTab({
  projectId,
  outcomes,
  policy,
  learnings,
  promptQuality,
  promptGovernanceEnabled,
  requireHumanApprovalForMerge,
}: {
  projectId: string;
  outcomes: ProjectOutcomeRow[];
  policy: PolicyMatrixCell[];
  learnings: ProjectLearning[];
  promptQuality: PromptQualitySummary | null;
  promptGovernanceEnabled: boolean;
  requireHumanApprovalForMerge: boolean;
}) {
  return (
    <div className="space-y-6">
      <LearningsCard
        projectId={projectId}
        learnings={learnings.map((l) => ({
          id: l.id,
          body: l.body,
          pinOrder: l.pinOrder,
          createdAt: l.createdAt.toISOString(),
          createdByName: l.createdByName,
        }))}
      />
      <MergeApprovalPolicyCard
        projectId={projectId}
        enabled={requireHumanApprovalForMerge}
      />
      <ActivePolicyMatrix cells={policy} />
      <PromptQualityCard
        data={promptGovernanceEnabled ? promptQuality : null}
        projectId={projectId}
      />
      <RecentOutcomes outcomes={outcomes} />
    </div>
  );
}
