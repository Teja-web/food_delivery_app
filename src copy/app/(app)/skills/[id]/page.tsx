import { ChevronLeft, CircleCheck, CircleX, Undo2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AutonomyPill } from "@/components/trust/AutonomyPill";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkline } from "@/components/viz/Sparkline";
import type { Skill } from "@/db/schema/skill/skill";
import type { SkillOutcomeVerdict } from "@/db/schema/skill/skill-outcome";
import { getSkill } from "@/actions/skill/skills";
import { computeAutonomyDistance, type AutonomyDistance } from "@/domain/autonomy-distance";
import { readChoreographyBody } from "@/operations/choreography/choreographies";
import {
  getRecentApprovalsForSkill,
  type SkillApprovalRow,
} from "@/operations/project/project-trust";

// NOTE: blocked-PR counting via the legacy execution-gate op is gone in the
// governance refactor. Until a replacement reads from the PreToolUse
// interceptor's automation_log, surface 0 here.
async function countBlockedPrsForSkill(
  _organizationId: string,
  _skillId: string,
  _projectId: string | null,
): Promise<number> {
  return 0;
}
import {
  getRecentSkillOutcomes,
  getSkillAutonomy,
  getSkillAutonomyAcrossProjects,
  getSkillStats30d,
  LEVEL_BLURBS,
} from "@/operations/skill/skill-autonomy";
import { projectCrud } from "@/operations/project/projects";
import { getActionContext } from "@/lib/auth/context";

import { levelLabel } from "../serialize";

type LevelKey = "OBSERVE" | "PROPOSE" | "MERGE" | "LEAD";

const LEVEL_CRITERIA: Record<LevelKey, string> = {
  OBSERVE: "5+ successful invocations to reach Propose",
  PROPOSE: "≥90% success rate across 5+ invocations and ≥14 days at level to reach Merge",
  MERGE: "≥90% success rate, no critical incidents, ≥14 days at level to reach Lead",
  LEAD: "Top of the ladder. Stays until a critical incident demotes.",
};

/**
 * What each autonomy level concretely permits inside coznt. This is the
 * "what changes when the skill is promoted?" answer — the missing half of
 * the trust-earned moment from `docs/ux/moments.md`. Edits here should be
 * paired with policy changes in `src/operations/approvals.ts` so the UI
 * doesn't drift from runtime behaviour.
 */
const LEVEL_PERMISSIONS: Record<LevelKey, { granted: string[]; gated: string[] }> = {
  OBSERVE: {
    granted: ["Read-only access to project context", "Can draft plans, gates, and PR comments"],
    gated: ["Cannot self-approve any change", "Cannot mutate releases or production state"],
  },
  PROPOSE: {
    granted: [
      "Can open PRs and propose plan revisions",
      "Can request approval — every change still routes through a human",
    ],
    gated: ["No auto-approve", "No release-channel writes"],
  },
  MERGE: {
    granted: [
      "Auto-approve eligible for low-risk PRs (work_item, plan)",
      "Can decide governance records of kind `approval` when scoped to its project",
    ],
    gated: ["Production releases still require human sign-off", "Demotes on a single critical incident"],
  },
  LEAD: {
    granted: [
      "Auto-approve eligible for all entity types within its project",
      "Can co-sign promotions of other skills",
      "Minimal oversight on routine changes",
    ],
    gated: ["Cannot demote peer skills", "Demotes on a single critical incident (no warning)"],
  },
};

const VERDICT_META: Record<
  SkillOutcomeVerdict,
  { label: string; tone: string; Icon: typeof CircleCheck }
> = {
  success: { label: "success", tone: "border-trend-up/40 text-trend-up", Icon: CircleCheck },
  rolled_back: { label: "rolled back", tone: "border-state-pending/40 text-state-pending", Icon: Undo2 },
  incident: { label: "incident", tone: "border-state-failed/40 text-state-failed", Icon: CircleX },
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

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const skill = (await getSkill(id)) as Skill | null;
  if (!skill) notFound();

  // Transitional: org-wide view (projectId=null). Per-project breakdown lands
  // in Milestone B alongside the skills ledger redesign.
  const ctx = await getActionContext();
  const autonomy = await getSkillAutonomy(skill.id, null);
  const stats = await getSkillStats30d(skill.id, null);
  const recent = await getRecentSkillOutcomes(skill.id, 20);
  const blockedPrs = await countBlockedPrsForSkill(ctx.organizationId, skill.id, null);
  const perProject = await getSkillAutonomyAcrossProjects(skill.id);
  const skillApprovals = await getRecentApprovalsForSkill(ctx.organizationId, skill.slug, 20);

  // Resolve project names for the cross-project rollup pane. The autonomy
  // rows only carry projectId; without the join the pane has nothing
  // human-readable to print.
  const referencedProjectIds = Array.from(
    new Set(
      perProject
        .map((p: { projectId: string | null }) => p.projectId)
        .filter((id: string | null): id is string => Boolean(id)),
    ),
  );
  const projectsById = new Map<string, { id: string; name: string }>();
  if (referencedProjectIds.length > 0) {
    const projectRows = await Promise.all(
      referencedProjectIds.map((id: string) => projectCrud.get(id).catch(() => null)),
    );
    for (const p of projectRows) {
      if (p) projectsById.set(p.id, { id: p.id, name: p.name });
    }
  }
  const label = levelLabel(autonomy.level);
  const sparkDirection = stats.success === 0 ? "flat" : stats.incident > 0 ? "down" : "up";
  const permissions = LEVEL_PERMISSIONS[label];
  const choreographyBody = readChoreographyBody(skill.slug);

  // Per-project stats + distance-to-next, for the cross-project pane.
  // N+1 query is fine for the small number of projects per skill; revisit if
  // we ever materialise hundreds of (skill, project) pairs.
  type PerProjectStats = {
    projectId: string | null;
    sparkline: number[];
    distance: AutonomyDistance;
  };
  const perProjectStats: PerProjectStats[] = await Promise.all(
    perProject.map(async (row): Promise<PerProjectStats> => {
      const s = await getSkillStats30d(skill.id, row.projectId);
      const daysAtLevel = (Date.now() - row.levelSetAt.getTime()) / (24 * 60 * 60 * 1000);
      const distance = computeAutonomyDistance({
        level: row.level,
        daysAtLevel,
        windowStats: {
          total: s.success + s.rollback + s.incident,
          successes: s.success,
          rollbacks: s.rollback,
          incidents: s.incident,
          criticalIncidents: s.criticalIncidents,
        },
      });
      return { projectId: row.projectId, sparkline: s.sparkline, distance };
    }),
  );
  const perProjectByKey = new Map(
    perProjectStats.map((p) => [p.projectId ?? "__org__", p]),
  );

  return (
    <div className="space-y-6">
      <Link
        href="/skills"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Skills ledger
      </Link>

      <header className="flex items-start justify-between gap-6 border-b pb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight">{skill.name}</h1>
            <AutonomyPill level={label} title={autonomy.lastReason ?? undefined} />
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {skill.slug}
            {skill.projectId ? null : <span className="ml-1 opacity-70">· org-wide</span>}
          </p>
          {skill.description ? (
            <p className="mt-2 max-w-2xl text-sm text-foreground/85">{skill.description}</p>
          ) : null}
        </div>
        <Badge
          variant="outline"
          className={skill.enabled ? "border-trend-up/40 text-trend-up" : "text-muted-foreground"}
        >
          {skill.enabled ? "Enabled" : "Disabled"}
        </Badge>
      </header>

      {blockedPrs > 0 ? (
        <div className="rounded-md border border-state-failed/40 bg-state-failed/[0.06] px-4 py-3">
          <div className="flex items-center gap-2">
            <CircleX className="h-3.5 w-3.5 shrink-0 text-state-failed" aria-hidden />
            <span className="text-sm font-medium text-state-failed">
              {blockedPrs} pull request{blockedPrs === 1 ? "" : "s"} currently blocked by the execution gate
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            This skill&apos;s autonomy isn&apos;t high enough to clear the change risk on these PRs, or a
            recent demotion re-graded them. A human reviewer can override from the plan detail page.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                30-day outcomes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="flex items-baseline gap-6">
                <div>
                  <div className="font-display text-3xl font-bold tabular-nums text-trend-up">
                    {stats.success}
                  </div>
                  <div className="text-[11px] text-muted-foreground">successes</div>
                </div>
                <div>
                  <div className="font-display text-3xl font-bold tabular-nums text-verdict-rollback">
                    {stats.rollback}
                  </div>
                  <div className="text-[11px] text-muted-foreground">rollbacks</div>
                </div>
                <div>
                  <div className="font-display text-3xl font-bold tabular-nums text-verdict-incident">
                    {stats.incident}
                  </div>
                  <div className="text-[11px] text-muted-foreground">incidents</div>
                </div>
                <div className="ml-auto">
                  <Sparkline
                    points={stats.sparkline}
                    direction={sparkDirection}
                    width={160}
                    height={36}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Current level &amp; criteria
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm">
              <div className="flex items-center gap-2">
                <AutonomyPill level={label} />
                <span className="text-foreground/85">{LEVEL_BLURBS[autonomy.levelName]}</span>
              </div>
              <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  Criteria for next level
                </div>
                <div className="text-foreground/85">{LEVEL_CRITERIA[label]}</div>
              </div>
              {autonomy.lastReason ? (
                <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                  <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    Last decision
                  </div>
                  <div className="text-foreground/85">{autonomy.lastReason}</div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Recent receipts · {recent.length}
                </CardTitle>
                <Link
                  href={`/audit?scope=skills`}
                  className="font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  open audit log →
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No invocations recorded yet. Outcomes appear here as the skill runs.
                </p>
              ) : (
                <ul className="divide-y divide-border/40">
                  {recent.map((r) => {
                    const meta = VERDICT_META[r.verdict];
                    return (
                      <li key={r.id} className="flex items-center gap-3 py-1.5 first:pt-0 last:pb-0">
                        <meta.Icon
                          className={`h-3.5 w-3.5 shrink-0 ${meta.tone.split(" ").find((c) => c.startsWith("text-")) ?? ""}`}
                          aria-hidden
                        />
                        <Badge
                          variant="outline"
                          className={`shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase ${meta.tone}`}
                        >
                          {meta.label}
                        </Badge>
                        {r.severity ? (
                          <Badge
                            variant="outline"
                            className="shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase text-muted-foreground"
                          >
                            {r.severity}
                          </Badge>
                        ) : null}
                        <span className="min-w-0 flex-1 truncate text-xs text-foreground/85">
                          {r.projectName ? (
                            <Link href={`/projects/${r.projectId}`} className="hover:underline">
                              {r.projectName}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">org-wide</span>
                          )}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                          {formatAge(r.recordedAt)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {choreographyBody ? (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    Choreography · claimed via CLAUDE.md / AGENTS.md
                  </CardTitle>
                  <span className="font-mono text-[10px] text-muted-foreground/80">
                    invoke_skill · {skill.slug}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="mb-3 text-xs text-muted-foreground">
                  This file is what the developer&apos;s AI editor sees. It tells the AI <em>when</em>{" "}
                  to call which governed verb. The actual LLM prompt for this skill stays server-side.
                </p>
                <pre className="max-h-[420px] overflow-auto rounded-md border border-border/60 bg-muted/20 p-3 font-mono text-[11px] leading-relaxed">
                  {choreographyBody}
                </pre>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Choreography
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-muted-foreground">
                No <span className="font-mono">SKILL.md</span> exists for this skill yet —
                it&apos;s server-only. Authoring a SKILL.md lets developers&apos; AI editors
                discover and invoke this skill via the CLAUDE.md / AGENTS.md claim and MCP
                tool descriptions.
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                What {label.toLowerCase()} unlocks
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0 text-xs">
              <div>
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-trend-up/80">
                  Granted
                </div>
                <ul className="space-y-1">
                  {permissions.granted.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-foreground/85">
                      <CircleCheck className="mt-0.5 h-3 w-3 shrink-0 text-trend-up" aria-hidden />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  Still gated
                </div>
                <ul className="space-y-1">
                  {permissions.gated.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-muted-foreground">
                      <CircleX className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 pt-0 text-xs text-muted-foreground">
              <div>
                Level set:{" "}
                <span className="font-mono text-foreground">
                  {autonomy.levelSetAt.getTime()
                    ? autonomy.levelSetAt.toLocaleDateString()
                    : "never"}
                </span>
              </div>
              <div>
                Last reviewed:{" "}
                <span className="font-mono text-foreground">
                  {autonomy.lastReviewedAt
                    ? autonomy.lastReviewedAt.toLocaleDateString()
                    : "never"}
                </span>
              </div>
              <div>
                Next review:{" "}
                <span className="font-mono text-foreground">
                  {autonomy.nextReviewAt
                    ? autonomy.nextReviewAt.toLocaleDateString()
                    : "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Across projects · {perProject.length}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {perProject.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No per-project trust earned yet. Per-(skill, project) rows appear
                  once the skill produces an outcome on a project.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {perProject.map((row) => {
                    const projectMeta = row.projectId ? projectsById.get(row.projectId) : null;
                    const projectLabel = projectMeta?.name ?? (row.projectId ? row.projectId.slice(0, 8) : "org-wide");
                    const rowLabel = (
                      ["OBSERVE", "PROPOSE", "MERGE", "LEAD"] as const
                    )[row.level] ?? "OBSERVE";
                    const stats = perProjectByKey.get(row.projectId ?? "__org__");
                    const distance = stats?.distance;
                    const distanceTone =
                      distance?.kind === "demotion-pending"
                        ? "border-state-failed/40 text-state-failed"
                        : distance?.kind === "eligible"
                          ? "border-trend-up/40 text-trend-up"
                          : "border-border/60 text-muted-foreground";
                    const rowSparkDirection = !stats
                      ? "flat"
                      : stats.sparkline.some((n) => n > 0)
                        ? "up"
                        : "flat";
                    return (
                      <li
                        key={`${row.projectId ?? "org"}-${row.levelSetAt.getTime()}`}
                        className="flex flex-col gap-2 rounded-sm border border-border/40 px-2 py-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-xs font-medium text-foreground">
                              {row.projectId && projectMeta ? (
                                <Link
                                  href={`/projects/${row.projectId}`}
                                  className="hover:underline"
                                >
                                  {projectLabel}
                                </Link>
                              ) : (
                                <span className={row.projectId ? "" : "text-muted-foreground"}>
                                  {projectLabel}
                                </span>
                              )}
                            </div>
                            <div className="truncate font-mono text-[10px] text-muted-foreground">
                              since {row.levelSetAt.toLocaleDateString()}
                            </div>
                          </div>
                          <AutonomyPill level={rowLabel} title={row.lastReason ?? undefined} />
                        </div>
                        {stats ? (
                          <div className="flex items-center justify-between gap-2">
                            <Badge
                              variant="outline"
                              className={`shrink-0 px-1.5 py-0 font-mono text-[10px] ${distanceTone}`}
                              title={distance?.label}
                            >
                              {distance?.label ?? "—"}
                            </Badge>
                            <Sparkline
                              points={stats.sparkline}
                              direction={rowSparkDirection}
                              width={80}
                              height={20}
                            />
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Approval history · {skillApprovals.length}
                </CardTitle>
                <Link
                  href="/plans?needs=approval"
                  className="font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  open approvals →
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {skillApprovals.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No approvals requested by this skill yet. When the dispatch gate denies a
                  call (autonomy below the required level), it lands here.
                </p>
              ) : (
                <ul className="divide-y divide-border/40">
                  {skillApprovals.map((a) => (
                    <SkillApprovalListItem key={a.id} approval={a} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

const APPROVAL_TONE: Record<SkillApprovalRow["status"], string> = {
  pending: "border-state-pending/40 text-state-pending",
  passed: "border-trend-up/40 text-trend-up",
  failed: "border-state-failed/40 text-state-failed",
  skipped: "border-muted-foreground/30 text-muted-foreground",
  expired: "border-muted-foreground/30 text-muted-foreground",
};

function SkillApprovalListItem({ approval }: { approval: SkillApprovalRow }) {
  return (
    <li className="flex items-center gap-2 py-1.5 first:pt-0 last:pb-0">
      <Badge
        variant="outline"
        className={`shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase ${APPROVAL_TONE[approval.status]}`}
      >
        {approval.status}
      </Badge>
      <Badge
        variant="outline"
        className="shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase text-muted-foreground"
      >
        plan
      </Badge>
      <span className="min-w-0 flex-1 truncate text-xs text-foreground/85">
        {approval.projectName && approval.projectId ? (
          <Link href={`/projects/${approval.projectId}`} className="hover:underline">
            {approval.projectName}
          </Link>
        ) : (
          <span className="text-muted-foreground">org-wide</span>
        )}
        {approval.decisionNote ? (
          <span className="ml-2 text-muted-foreground/70">— {approval.decisionNote}</span>
        ) : null}
      </span>
      <span
        className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums"
        title={approval.decidedAt ? `Decided ${approval.decidedAt.toISOString()}` : "Pending"}
      >
        {formatAge(approval.createdAt)}
      </span>
    </li>
  );
}
