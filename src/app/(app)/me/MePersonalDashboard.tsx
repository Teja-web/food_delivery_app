import Link from "next/link";
import { ArrowRight, Clock, UserCheck, Activity } from "lucide-react";
import type { getMeDashboard } from "@/operations/prompt/personal";
import type { Approval } from "@/db/schema/plan/approval";

type DashboardData = Awaited<ReturnType<typeof getMeDashboard>>;

/**
 * Destination for a "decide this approval" affordance. /approvals is gone —
 * every approval lives on its target entity's detail page (where Approve /
 * Reject buttons render and a reviewer can see context). `phase_gate` and
 * `work_item` route to the project detail page; `skill_invocation` has no
 * dedicated home yet, so we fall back to the originating skill.
 */
function approvalDecisionHref(a: Approval): string {
  switch (a.entityType) {
    case "plan":
    case "release":
      return `/plans/${a.entityId}`;
    case "phase_gate":
      return a.projectId ? `/projects/${a.projectId}/phases` : "/projects";
    case "work_item":
      return a.projectId ? `/projects/${a.projectId}/work-items` : "/projects";
    case "skill_invocation":
      return "/skills";
    default:
      return "/plans";
  }
}

const LEVEL_LABEL = ["observe", "propose", "merge", "lead"];

/**
 * /me — personal slice of the audit ledger.
 *
 * Strictly: contributions to project autonomy, approvals waiting on/blocking
 * me, recent outcomes attributable to me. No personal todos, no time
 * tracking, no goals (SP-territory, violates overlay positioning — see
 * developer-velocity.md invariant #3 scoping note).
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
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Personal</p>
        <h1 className="text-2xl font-semibold mt-1">Hi, {userName}.</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your slice of the audit ledger — autonomy contributions, open approvals, recent outcomes.
        </p>
      </header>

      {/* Top-line stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

      {/* Approvals blocking me */}
      <Section title="Awaiting your decision">
        {data.blockingMe.length === 0 ? (
          <Empty>Nothing requires your sign-off right now.</Empty>
        ) : (
          <ul className="rounded-xl border border-border bg-card divide-y divide-border">
            {data.blockingMe.map((a) => (
              <li key={a.id} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {a.entityType} · {a.entityId.slice(0, 12)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    requested by {a.requestedByName ?? a.requestedById} ·{" "}
                    {ageLabel(a.createdAt)}
                  </p>
                  {a.requesterNote && (
                    <p className="text-xs text-muted-foreground mt-1 italic">{a.requesterNote}</p>
                  )}
                </div>
                <Link
                  href={approvalDecisionHref(a)}
                  className="text-xs text-foreground hover:underline shrink-0 inline-flex items-center gap-1"
                >
                  Decide <ArrowRight className="h-3 w-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Approvals waiting on me */}
      <Section title="Approvals you requested">
        {data.waitingOnMe.length === 0 ? (
          <Empty>No open requests from you.</Empty>
        ) : (
          <ul className="rounded-xl border border-border bg-card divide-y divide-border">
            {data.waitingOnMe.map((a) => (
              <li key={a.id} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {a.entityType} · {a.entityId.slice(0, 12)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    open {ageLabel(a.createdAt)} · {a.approverIds?.length ?? 0} approver(s)
                  </p>
                </div>
                <Link
                  href={approvalDecisionHref(a)}
                  className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                >
                  View
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Per-project autonomy */}
      <Section title="Project autonomy">
        <p className="text-xs text-muted-foreground mb-2">
          {leadCount} skills at <span className="font-mono">lead</span> across {totalAutonomyRows}{" "}
          (skill, project) pairs.
        </p>
        {data.projectAggregates.length === 0 ? (
          <Empty>No projects yet.</Empty>
        ) : (
          <ul className="rounded-xl border border-border bg-card divide-y divide-border">
            {data.projectAggregates
              .sort((a, b) => b.total - a.total)
              .slice(0, 10)
              .map((p) => (
                <li key={p.projectId} className="px-4 py-3 flex items-center gap-3">
                  <Link
                    href={`/projects/${p.projectId}`}
                    className="text-sm font-medium text-foreground hover:underline flex-1 min-w-0 truncate"
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
                    <span className="text-xs text-rose-600 font-medium tabular-nums shrink-0">
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
          <ul className="rounded-xl border border-border bg-card divide-y divide-border">
            {data.recentOutcomes.slice(0, 15).map((o) => (
              <li key={o.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                <VerdictDot verdict={o.verdict} />
                <span className="font-mono text-xs text-muted-foreground shrink-0">
                  {o.sourceKind ?? "invocation"}
                </span>
                <span className="text-foreground flex-1 min-w-0 truncate">
                  {o.rationale ?? o.sourceRef ?? o.id}
                </span>
                <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
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
      <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{title}</h2>
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
    <div className="flex items-center gap-2 shrink-0">
      <div className="flex h-2 w-32 overflow-hidden rounded-full bg-muted">
        {observe > 0 && <div className="bg-slate-400" style={{ width: pct(observe) }} title={`observe: ${observe}`} />}
        {propose > 0 && <div className="bg-amber-500" style={{ width: pct(propose) }} title={`propose: ${propose}`} />}
        {merge > 0 && <div className="bg-emerald-500" style={{ width: pct(merge) }} title={`merge: ${merge}`} />}
        {lead > 0 && <div className="bg-violet-500" style={{ width: pct(lead) }} title={`lead: ${lead}`} />}
      </div>
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">{total}</span>
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
  return <span className={`h-2 w-2 rounded-full shrink-0 ${color}`} aria-label={verdict ?? "unknown"} />;
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
