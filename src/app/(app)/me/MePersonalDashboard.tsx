import Link from "next/link";
import { ArrowRight, Clock, UserCheck, Activity } from "lucide-react";

import type { GovernanceRecord } from "@/db/schema/governance/records";
import type { getMeDashboard } from "@/operations/prompt/personal";

type DashboardData = Awaited<ReturnType<typeof getMeDashboard>>;

type ApprovalDetails = {
  requestedById?: string;
  requestedByName?: string;
  requesterNote?: string;
  approverIds?: string[];
};

function detailsOf(r: GovernanceRecord): ApprovalDetails {
  return (r.details ?? {}) as ApprovalDetails;
}

/**
 * Destination for a "decide this governance record" affordance. Every
 * record targets a project_task (no more polymorphic entity types), so
 * the canonical landing is always the plan detail page.
 */
function recordDecisionHref(r: GovernanceRecord): string {
  return `/plans/${r.projectTaskId}`;
}

const LEVEL_LABEL = ["observe", "propose", "merge", "lead"];

/**
 * /me — personal slice of the audit ledger.
 *
 * Approvals waiting on me, approvals I requested, per-project autonomy
 * posture, and recent outcomes attributable to me.
 */
export function MePersonalDashboard({
  data,
  userName,
}: {
  data: DashboardData;
  userName: string;
}) {
  const totalAutonomyRows = data.projectAggregates.reduce((sum, p) => sum + p.total, 0);
  const leadCount = data.projectAggregates.reduce((sum, p) => sum + p.lead, 0);
  const recentIncidents = data.projectAggregates.reduce((sum, p) => sum + p.incidentsLast7d, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Personal</p>
        <h1 className="mt-1 text-2xl font-semibold">Hi, {userName}.</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your slice of the audit ledger — autonomy contributions, open approvals, recent outcomes.{" "}
          <Link href="/governance/inbox" className="hover:underline">
            Open inbox →
          </Link>
        </p>
      </header>

      {/* Top-line stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          value={data.waitingOnMe.length}
          label="Approvals you requested"
          caption="awaiting decision"
          icon={Clock}
        />
        <StatTile
          value={data.blockingMe.length}
          label="Awaiting your decision"
          caption="blocking others"
          icon={UserCheck}
        />
        <StatTile
          value={recentIncidents}
          label="Incidents (7d)"
          caption={`across ${data.projectAggregates.length} projects`}
          icon={Activity}
          warn={recentIncidents > 0}
        />
      </div>

      {/* Records blocking me */}
      <Section title="Awaiting your decision">
        {data.blockingMe.length === 0 ? (
          <Empty>Nothing requires your sign-off right now.</Empty>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {data.blockingMe.map((r) => {
              const d = detailsOf(r);
              return (
                <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {r.kind} · plan {r.projectTaskId.slice(0, 12)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      requested by {d.requestedByName ?? d.requestedById ?? "—"} ·{" "}
                      {ageLabel(r.createdAt)}
                    </p>
                    {d.requesterNote ? (
                      <p className="mt-1 text-xs italic text-muted-foreground">
                        {d.requesterNote}
                      </p>
                    ) : null}
                  </div>
                  <Link
                    href={recordDecisionHref(r)}
                    className="inline-flex shrink-0 items-center gap-1 text-xs text-foreground hover:underline"
                  >
                    Decide <ArrowRight className="h-3 w-3" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Records waiting on me */}
      <Section title="Approvals you requested">
        {data.waitingOnMe.length === 0 ? (
          <Empty>No open requests from you.</Empty>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {data.waitingOnMe.map((r) => {
              const d = detailsOf(r);
              return (
                <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {r.kind} · plan {r.projectTaskId.slice(0, 12)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      open {ageLabel(r.createdAt)} · {d.approverIds?.length ?? 0} approver(s)
                    </p>
                  </div>
                  <Link
                    href={recordDecisionHref(r)}
                    className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                  >
                    View
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Per-project autonomy */}
      <Section title="Project autonomy">
        <p className="mb-2 text-xs text-muted-foreground">
          {leadCount} skills at <span className="font-mono">lead</span> across {totalAutonomyRows}{" "}
          (skill, project) pairs.
        </p>
        {data.projectAggregates.length === 0 ? (
          <Empty>No projects yet.</Empty>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {data.projectAggregates
              .sort((a, b) => b.total - a.total)
              .slice(0, 10)
              .map((p) => (
                <li key={p.projectId} className="flex items-center gap-3 px-4 py-3">
                  <Link
                    href={`/projects/${p.projectId}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium text-foreground hover:underline"
                  >
                    {p.projectName}
                  </Link>
                  <AutonomyBar
                    observe={p.observe}
                    propose={p.propose}
                    merge={p.merge}
                    lead={p.lead}
                  />
                  {p.incidentsLast7d > 0 && (
                    <span className="shrink-0 text-xs font-medium tabular-nums text-rose-600">
                      {p.incidentsLast7d} incident{p.incidentsLast7d === 1 ? "" : "s"}
                    </span>
                  )}
                </li>
              ))}
          </ul>
        )}
      </Section>

      {/* Recent outcomes */}
      <Section title="Recent outcomes from skills you've authored through">
        {data.recentOutcomes.length === 0 ? (
          <Empty>No recent AI-authored activity attributable to you.</Empty>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {data.recentOutcomes.slice(0, 15).map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <VerdictDot verdict={o.verdict} />
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {o.sourceKind ?? "invocation"}
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {o.rationale ?? o.sourceRef ?? o.id}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {ageLabel(o.recordedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-4 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function StatTile({
  value,
  label,
  caption,
  icon: Icon,
  warn,
}: {
  value: number | string;
  label: string;
  caption?: string;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p
          className={`text-2xl font-semibold tabular-nums ${warn ? "text-rose-600" : "text-foreground"}`}
        >
          {value}
        </p>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />}
      </div>
      <p className="mt-1 text-xs font-medium text-foreground">{label}</p>
      {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
    </div>
  );
}

function AutonomyBar({
  observe,
  propose,
  merge,
  lead,
}: {
  observe: number;
  propose: number;
  merge: number;
  lead: number;
}) {
  const total = observe + propose + merge + lead;
  if (total === 0) return <span className="text-xs text-muted-foreground">no skills</span>;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="flex h-2 w-32 overflow-hidden rounded-full bg-muted">
        {observe > 0 && (
          <div className="bg-slate-400" style={{ width: pct(observe) }} title={`observe: ${observe}`} />
        )}
        {propose > 0 && (
          <div className="bg-amber-500" style={{ width: pct(propose) }} title={`propose: ${propose}`} />
        )}
        {merge > 0 && (
          <div className="bg-emerald-500" style={{ width: pct(merge) }} title={`merge: ${merge}`} />
        )}
        {lead > 0 && (
          <div className="bg-violet-500" style={{ width: pct(lead) }} title={`lead: ${lead}`} />
        )}
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{total}</span>
    </div>
  );
}

function VerdictDot({ verdict }: { verdict: string | null }) {
  const color =
    verdict === "success"
      ? "bg-emerald-500"
      : verdict === "rolled_back"
        ? "bg-amber-500"
        : verdict === "incident"
          ? "bg-rose-500"
          : "bg-slate-400";
  return (
    <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} aria-label={verdict ?? "unknown"} />
  );
}

function ageLabel(d: Date): string {
  const ms = Date.now() - d.getTime();
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

// Suppressed lint: LEVEL_LABEL retained for backwards-compat (test fixtures).
void LEVEL_LABEL;
