import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Code2,
  Compass,
  FileText,
  GitMerge,
  Milestone,
  Radio,
  Shield,
  Sparkles,
  Terminal,
  TestTube,
  TrendingUp,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageMeta } from "@/components/marketing/PageMeta";

const SIGN_IN = "/auth/sign-in";

export function MarketingLanding() {
  return (
    <MarketingShell active="landing">
      {/* ─────────── Hero ─────────── */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="dot-grid absolute inset-0 opacity-40" aria-hidden />
        <div
          aria-hidden
          className="anim-pulse-soft absolute left-[-160px] top-[-220px] h-[620px] w-[620px] rounded-full bg-primary/12 blur-[140px]"
        />
        <div
          aria-hidden
          className="anim-pulse-soft absolute right-[-180px] top-[35%] h-[520px] w-[520px] rounded-full bg-[var(--autonomy-lead)]/10 blur-[160px]"
        />
        <div className="relative mx-auto max-w-7xl px-6 pt-14 pb-20 md:pt-20 md:pb-24">
          <PageMeta
            label="Manifesto · May 2026"
            qualifier="Engineering org operating system"
            link={{ href: "/manifesto", text: "Read the manifesto" }}
          />

          {/* Two-column asymmetric hero */}
          <div className="mt-12 grid gap-12 md:mt-16 md:grid-cols-[1.35fr_1fr] md:gap-16 lg:gap-20">
            {/* LEFT — Manifesto headline */}
            <div className="anim-fade-up">
              <h1 className="font-display text-[52px] font-bold leading-[0.92] tracking-[-0.03em] sm:text-[68px] md:text-[80px] lg:text-[96px]">
                AI shipped <br />
                faster than <br />
                <span className="text-primary">trust.</span>
              </h1>
              <div className="mt-8 max-w-lg space-y-4 text-[16px] leading-[1.65] text-muted-foreground">
                <p>
                  Every engineering org installed Cursor. The org charts didn&rsquo;t
                  change. The audit boundary stayed at &ldquo;a human pressed merge.&rdquo;
                </p>
                <p className="text-foreground">
                  Coznt is the autonomy ledger that closes the gap.{" "}
                  <span className="font-display font-semibold tracking-tight">
                    Autonomy with observability.
                  </span>
                </p>
              </div>
              <div className="mt-10 flex flex-wrap items-center gap-2">
                <Button asChild size="lg" className="h-12 px-6 text-[14px]">
                  <Link href={SIGN_IN}>
                    Get access <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="ghost" className="h-12 px-4 text-[14px] text-muted-foreground hover:text-foreground">
                  <Link href="/how-it-works">
                    See how it works <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>

            {/* RIGHT — Live ledger preview */}
            <div className="anim-fade-up delay-200 md:translate-y-2">
              <LiveLedgerHero />
            </div>
          </div>

        </div>
      </section>

      {/* ─────────── Manifesto pull-quote ─────────── */}
      <section className="relative overflow-hidden border-b border-border/60 bg-card/30">
        <div className="mx-auto max-w-4xl px-6 py-20 md:py-24">
          <div className="anim-fade-up">
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              The thesis
            </span>
            <p className="mt-5 font-display text-[28px] font-semibold leading-[1.3] tracking-[-0.01em] text-foreground md:text-[36px]">
              The teams that <span className="text-primary">grade autonomy from evidence</span> will
              out-ship the teams that <span className="text-muted-foreground line-through decoration-muted-foreground/40">gate autonomy by policy</span>.
            </p>
            <p className="mt-6 max-w-2xl text-[15px] leading-[1.6] text-muted-foreground">
              Cursor, Devin, Copilot, Claude Code &mdash; the productivity layer is done. The next
              decade of engineering management isn&rsquo;t about hiring more humans. It&rsquo;s
              about <em>graduating more agents</em>. Coznt is the substrate.
            </p>
            <Link
              href="/manifesto"
              className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
            >
              Read the manifesto <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─────────── Six phases ─────────── */}
      <section id="phases" className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
          <div className="mb-12 max-w-2xl">
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              The six phases
            </span>
            <h2 className="mt-3 font-display text-[34px] font-bold leading-[1.1] tracking-[-0.015em] md:text-[42px]">
              One project. One loop. <span className="text-primary">Six phases.</span>
            </h2>
            <p className="mt-4 text-[15px] text-muted-foreground">
              The SDLC isn&rsquo;t a Kanban board. It&rsquo;s a sequence of gated transitions, each
              with deterministic criteria and earned autonomy that compounds across them.
            </p>
          </div>
          <PhasesFlow />
        </div>
      </section>

      {/* ─────────── Thesis grid ─────────── */}
      <section id="trust" className="border-b border-border/60">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 md:grid-cols-[1fr_1.4fr] md:py-28">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              What &ldquo;observable&rdquo; means
            </span>
            <h2 className="mt-3 font-display text-[34px] font-bold leading-[1.1] tracking-[-0.015em] md:text-[42px]">
              Every claim has a receipt.
            </h2>
          </div>
          <div className="space-y-6 text-[15px] leading-[1.6] text-muted-foreground">
            <p>
              The peer set isn&rsquo;t Notion or Asana. It&rsquo;s Linear, Vercel, Datadog,
              Grafana, Cursor itself. Every pixel earns its place &mdash; and every number on
              screen links back to its source of record.
            </p>
            <p className="text-foreground">
              Skill autonomy is a level, not vibes. Gate state is deterministic, not narrative.
              DORA attribution is causal, not correlative. The audit posture is visible in the
              UI before it&rsquo;s queryable from the database.
            </p>
            <ul className="grid grid-cols-1 gap-3 pt-2 text-[13px] sm:grid-cols-2">
              <ThesisPoint icon={Sparkles} title="Graded skills" body="Observe → Propose → Merge → Lead, per project. Promotion carries 30 days of receipts." />
              <ThesisPoint icon={Milestone} title="Deterministic gates" body="Same project state always yields the same gate result. Diffs are shown when they change." />
              <ThesisPoint icon={Activity} title="Causal DORA" body="Spikes attributed to specific deploys, skills, and autonomy state at the time." />
              <ThesisPoint icon={Shield} title="Tamper-evident audit log" body="Every row hashes its fields. Exports are byte-stable &mdash; diff yesterday&rsquo;s against today&rsquo;s." />
            </ul>
          </div>
        </div>
      </section>

      {/* ─────────── Five moments ─────────── */}
      <section id="moments" className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
          <div className="mb-16 max-w-2xl">
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Five moments
            </span>
            <h2 className="mt-3 font-display text-[34px] font-bold leading-[1.1] tracking-[-0.015em] md:text-[42px]">
              Designed for the workdays that hurt today.
            </h2>
            <p className="mt-4 text-[15px] text-muted-foreground">
              Not a feature list. Five trigger-to-outcome loops, each with a trust signal that
              wasn&rsquo;t possible before.
            </p>
          </div>

          <div className="space-y-20">
            <Moment
              n="01"
              persona="Sam · Team Lead"
              trigger="Friday afternoon: 'Quick status across all your projects before Monday?'"
              title="The portfolio sweep, in 90 seconds."
              body="Open /projects. Every project's phase, blocking gates, autonomy events this week, deploy count, change-failure trend &mdash; at a glance. Drop the link in Slack."
              signal="Every claim is one click from its source of record. No coznt-only numbers."
              preview={<PortfolioPreview />}
            />
            <Moment
              n="02"
              persona="Sam · Team Lead"
              trigger="The Design → Development gate fails."
              title="Named unmet criteria. With the next action."
              body="Not 'gate failed.' Instead: 'ADR-0014 review pending @rohan since Tuesday; test coverage at 67% (gate: 80%).' Each criterion has assignee, link, expected SLA."
              signal="Gate state is deterministic and reproducible. If yesterday passed and today fails, the diff is shown."
              preview={<GatePreview />}
              flip
            />
            <Moment
              n="03"
              persona="Sam · Team Lead"
              trigger="Monday 9am. 12 approvals waiting. 20 minutes."
              title="Clear nine in eight minutes."
              body="One inbox. Each row carries the requesting skill's track record so you know whether to trust the request before reading the diff."
              signal="Skill track record visible inline: 'Merge · 47✓ / 2↻ / 0⚡ (30d).'"
              preview={<ApprovalsPreview />}
            />
            <Moment
              n="04"
              persona="Priya · Director of Engineering"
              trigger="Friday review. A skill has been clean for 30 days."
              title="Propose → Merge. With receipts."
              body="The promotion event lands prominently: the stats that earned it, the projects it ran on, the new permissions it unlocks. One click to approve."
              signal="Every claim is queryable. Show me the 47 successes. Show me what counts as a success. Show me the auto-demote threshold."
              preview={<AutonomyPreview />}
              flip
            />
            <Moment
              n="05"
              persona="Priya + Jordan · DoE + SRE"
              trigger="Change-failure rate ticks up 4% week-over-week."
              title="Which team is driving the regression?"
              body="The cross-project view shows the portfolio number on top, then each project's CFR as a sparkline. The two that spiked are visually obvious."
              signal="Attribution is causal, not correlative. Click the spike &mdash; three deploys, one skill, autonomy state at the time of each deploy."
              preview={<MetricsPreview />}
            />
          </div>
        </div>
      </section>

      {/* ─────────── Mode 1 → Mode 2 (replaces Cursor overclaim) ─────────── */}
      <section className="border-b border-border/60 bg-card/30">
        <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
          <div className="mb-14 max-w-2xl">
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              The loop, in two modes
            </span>
            <h2 className="mt-3 font-display text-[34px] font-bold leading-[1.1] tracking-[-0.015em] md:text-[42px]">
              The ledger learns from your team <span className="text-primary">before</span> it learns from your agents.
            </h2>
            <p className="mt-4 text-[15px] text-muted-foreground">
              An autonomy ledger only works if it has signal. Coznt fills it from your existing
              SDLC behavior first &mdash; PRs, deploys, gates &mdash; then layers AI invocations
              on top once a project has a baseline.
            </p>
          </div>

          <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2">
            <ModeCard
              tag="Mode 1 · Today"
              title="Ledger fills from deterministic signal."
              body="Your team already produces evidence. Every PR merged within SLA, every clean deploy, every gate passed becomes an outcome row in the ledger. The project learns what 'good' looks like before a single agent is in the loop."
              points={[
                "PR merged within SLA · no rollback within 7d",
                "Deploy clean · no incident within 24h",
                "Phase gate passed · criteria checked",
                "Work item closed · no revert in window",
              ]}
              tone="primary"
            />
            <ModeCard
              tag="Mode 2 · Forward-looking"
              title="Agents join. Same rubric. Same ledger."
              body="When an AI agent is dispatched, its invocation appends an outcome to the same ledger your humans have been filling. Autonomy accumulates per (skill, project). A merge agent on a docs repo restarts at observe on payments."
              points={[
                "Agent invocation → outcome row, same shape",
                "Per-project autonomy, not per-skill",
                "Threshold check on dispatch · auto vs. routed",
                "Trust earned is portable; scope is not",
              ]}
              tone="muted"
            />
          </div>
        </div>
      </section>

      {/* ─────────── Agent surfaces trio ─────────── */}
      <section id="surfaces" className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
          <div className="mb-12 max-w-2xl">
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Three ways in
            </span>
            <h2 className="mt-3 font-display text-[34px] font-bold leading-[1.1] tracking-[-0.015em] md:text-[42px]">
              The loop stays the same. <span className="text-primary">The input doesn&rsquo;t matter.</span>
            </h2>
            <p className="mt-4 text-[15px] text-muted-foreground">
              MCP is not the primary surface. It&rsquo;s one of three. Every entry point hits the
              same governed API and writes to the same ledger.
            </p>
          </div>
          <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
            <SurfaceCard
              icon={Radio}
              kind="HTTP API"
              syntax="GET /api/v1/context"
              body="Bearer token, project-scoped. Any agent, any editor, any CI job. JSON in, JSON out. The substrate."
            />
            <SurfaceCard
              icon={Terminal}
              kind="CLI"
              syntax="npx coznt context"
              body="Thin wrapper. Reads .coznt/config.json from the repo root. Zero SDK. cURL works just as well."
            />
            <SurfaceCard
              icon={Sparkles}
              kind="MCP"
              syntax="coznt.get_my_context"
              body="Optional adapter over HTTP. Plugs into Cursor, Claude Code, Cline, Continue, Zed. IDE-grade ergonomics, ledgered the same way."
            />
          </div>
          <div className="mt-10">
            <McpPreview />
          </div>
        </div>
      </section>

      {/* ─────────── Integrations ─────────── */}
      <section id="integrations" className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-6 py-16 md:py-20">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
            <div>
              <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Systems of record
              </span>
              <h2 className="mt-3 font-display text-[28px] font-bold leading-[1.15] tracking-[-0.015em] md:text-[32px]">
                Plug into what you already trust.
              </h2>
            </div>
            <p className="max-w-md text-[13px] text-muted-foreground">
              Coznt doesn&rsquo;t replace your tracker, repo, or runbook. It coordinates them
              &mdash; and attributes every claim back to the underlying source.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-4">
            <IntegrationCell name="GitHub" id="gh-pr-1234" body="Pull requests · deployments · checks" />
            <IntegrationCell name="Jira" id="FT-1024" body="Work items · transitions · statuses" />
            <IntegrationCell name="Azure DevOps" id="ado-3902" body="Pipelines · boards · repos" />
            <IntegrationCell name="Confluence" id="conf-204" body="ADRs · runbooks · policies" />
          </div>
          <div className="mt-5">
            <Link
              href="/connect"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
            >
              See every integration &mdash; ingest and emit <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─────────── Closing CTA ─────────── */}
      <section className="relative overflow-hidden">
        <div className="dot-grid absolute inset-0 opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-6 py-24 text-center md:py-32">
          <h2 className="font-display text-[36px] font-bold leading-[1.1] tracking-[-0.02em] md:text-[48px]">
            Start with one project.<br />
            <span className="text-primary">Auditability follows for free.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-md text-[15px] text-muted-foreground">
            Wire up GitHub. Import a plan. Watch the first PR merge become a row in your
            autonomy ledger.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="h-11 px-5">
              <Link href={SIGN_IN}>
                Get access <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11 border-border/80 bg-transparent px-5">
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

/* ═══════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════ */

function ThesisPoint({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Activity;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3 rounded-md border border-border/70 bg-card/40 p-3">
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" strokeWidth={1.75} />
      <div>
        <div className="text-[13px] font-semibold text-foreground">{title}</div>
        <div className="mt-0.5 text-[12px] leading-[1.5] text-muted-foreground">{body}</div>
      </div>
    </li>
  );
}

function LiveLedgerHero() {
  type Tone = "primary" | "passed" | "neutral" | "incident";
  const events: {
    ts: string;
    kind: string;
    icon: typeof Sparkles;
    project: string;
    detail: string;
    tone?: Tone;
  }[] = [
    {
      ts: "now",
      kind: "promotion",
      icon: Sparkles,
      project: "schema-migrator",
      detail: "Propose → Merge · 30d clean",
      tone: "primary",
    },
    {
      ts: "2m",
      kind: "pr.merge",
      icon: GitMerge,
      project: "FinTrack",
      detail: "PR #1248 · merge · 92% cov",
      tone: "passed",
    },
    {
      ts: "3m",
      kind: "deploy.clean",
      icon: Zap,
      project: "Polaris",
      detail: "canary 15m clean · lead",
      tone: "passed",
    },
    {
      ts: "8m",
      kind: "gate.pass",
      icon: Milestone,
      project: "Atlas",
      detail: "design → development",
    },
    {
      ts: "12m",
      kind: "outcome.success",
      icon: CheckCircle2,
      project: "Nimbus",
      detail: "frontend-test-author · ✓",
    },
    {
      ts: "18m",
      kind: "incident",
      icon: AlertTriangle,
      project: "FinTrack",
      detail: "rollback · skill demoted",
      tone: "incident",
    },
  ];

  const toneColor = (tone?: Tone) => {
    if (tone === "primary") return "text-primary";
    if (tone === "passed") return "text-[var(--state-passed)]";
    if (tone === "incident") return "text-[var(--verdict-incident)]";
    return "text-muted-foreground";
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[0_30px_60px_-25px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between border-b border-border/60 bg-background/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--state-failed)]/40" />
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--state-pending)]/40" />
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--state-passed)]/40" />
          </div>
          <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            ~/coznt · ledger
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--state-passed)]">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--state-passed)] opacity-60" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--state-passed)]">
            Live
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[44px_88px_1fr] gap-3 border-b border-border/40 px-4 py-2 font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        <span>Ago</span>
        <span>Kind</span>
        <span>Project · Detail</span>
      </div>

      <ul>
        {events.map((e, i) => (
          <li
            key={`${e.ts}-${e.kind}`}
            className={`anim-fade-up grid grid-cols-[44px_88px_1fr] items-center gap-3 border-b border-border/30 px-4 py-2.5 last:border-b-0 ${
              e.tone === "primary" ? "bg-primary/[0.05]" : ""
            }`}
            style={{ animationDelay: `${280 + i * 90}ms` }}
          >
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {e.ts}
            </span>
            <span className="flex items-center gap-1.5">
              <e.icon className={`h-3 w-3 ${toneColor(e.tone)}`} strokeWidth={2} />
              <span className="font-mono text-[10px] text-muted-foreground">{e.kind}</span>
            </span>
            <span className="flex items-baseline gap-2 truncate">
              <span className="truncate text-[12px] font-medium text-foreground">
                {e.project}
              </span>
              <span className="truncate font-mono text-[10.5px] text-muted-foreground">
                {e.detail}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-3 gap-px border-t border-border/40 bg-border/60">
        <LedgerStat value="142" label="outcomes · 24h" />
        <LedgerStat value="3" label="promotions · 7d" tone="primary" icon={TrendingUp} />
        <LedgerStat value="98.6%" label="deploys clean · 7d" />
      </div>
    </div>
  );
}

function LedgerStat({
  value,
  label,
  tone,
  icon: Icon,
}: {
  value: string;
  label: string;
  tone?: "primary";
  icon?: typeof TrendingUp;
}) {
  return (
    <div className="flex flex-col items-start gap-1 bg-card px-4 py-3">
      <div className="flex items-center gap-1.5">
        <span
          className={`font-display text-[22px] font-bold leading-none tabular-nums ${
            tone === "primary" ? "text-primary" : "text-foreground"
          }`}
        >
          {value}
        </span>
        {Icon && (
          <Icon
            className={`h-3.5 w-3.5 ${tone === "primary" ? "text-primary" : "text-[var(--trend-up)]"}`}
            strokeWidth={2.25}
          />
        )}
      </div>
      <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function PhasesFlow() {
  const phases = [
    {
      n: "01",
      key: "requirements",
      icon: FileText,
      title: "Requirements",
      gate: "Acceptance criteria signed",
      plan: "story",
    },
    {
      n: "02",
      key: "design",
      icon: Compass,
      title: "Design",
      gate: "ADR reviewed · linked",
      plan: "adr",
    },
    {
      n: "03",
      key: "development",
      icon: Code2,
      title: "Development",
      gate: "PR · tests · review",
      plan: "feature",
    },
    {
      n: "04",
      key: "testing",
      icon: TestTube,
      title: "Testing",
      gate: "Coverage ≥ threshold",
      plan: "test_plan",
    },
    {
      n: "05",
      key: "cicd",
      icon: Zap,
      title: "CI/CD",
      gate: "Deploy clean · canary",
      plan: "release_plan",
    },
    {
      n: "06",
      key: "monitoring",
      icon: Activity,
      title: "Monitoring",
      gate: "No incident in window",
      plan: "incident",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3 lg:grid-cols-6">
        {phases.map((p) => (
          <div key={p.key} className="relative flex flex-col gap-3 bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-muted-foreground">{p.n}</span>
              <p.icon className="h-4 w-4 text-primary" strokeWidth={1.75} />
            </div>
            <div>
              <div className="text-[14px] font-semibold tracking-tight text-foreground">{p.title}</div>
              <div className="mt-2 flex items-start gap-1.5 text-[11px] leading-[1.45] text-muted-foreground">
                <Milestone className="mt-0.5 h-3 w-3 flex-shrink-0 text-[var(--state-pending)]" />
                <span>{p.gate}</span>
              </div>
              <div className="mt-1.5 font-mono text-[10px] text-muted-foreground">
                plan.kind = {p.plan}
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="max-w-3xl text-[13px] leading-[1.6] text-muted-foreground">
        A project advances by passing the gate on its current phase. Every advance is a row
        in the audit log. Every skill that contributed earns or loses autonomy on this
        project, not on the skill in the abstract.
      </p>
    </div>
  );
}

function ModeCard({
  tag,
  title,
  body,
  points,
  tone,
}: {
  tag: string;
  title: string;
  body: string;
  points: string[];
  tone: "primary" | "muted";
}) {
  const dotClass = tone === "primary" ? "bg-primary" : "bg-muted-foreground/50";
  return (
    <div className="bg-card p-6 md:p-8">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        {tag}
      </div>
      <h3 className="mt-4 font-display text-[22px] font-bold leading-[1.2] tracking-[-0.01em] md:text-[26px]">
        {title}
      </h3>
      <p className="mt-3 text-[14px] leading-[1.6] text-muted-foreground">{body}</p>
      <ul className="mt-5 space-y-2 border-t border-border/40 pt-4">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2 text-[12.5px] text-foreground">
            <CheckCircle2 className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${tone === "primary" ? "text-primary" : "text-muted-foreground"}`} />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SurfaceCard({
  icon: Icon,
  kind,
  syntax,
  body,
}: {
  icon: typeof Radio;
  kind: string;
  syntax: string;
  body: string;
}) {
  return (
    <div className="flex flex-col gap-3 bg-card p-6">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" strokeWidth={1.75} />
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {kind}
        </span>
      </div>
      <code className="block rounded border border-border/60 bg-background/40 px-2.5 py-1.5 font-mono text-[12px] text-foreground">
        {syntax}
      </code>
      <p className="text-[13px] leading-[1.55] text-muted-foreground">{body}</p>
    </div>
  );
}

function Moment({
  n,
  persona,
  trigger,
  title,
  body,
  signal,
  preview,
  flip,
}: {
  n: string;
  persona: string;
  trigger: string;
  title: string;
  body: string;
  signal: string;
  preview: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <div className={`grid items-center gap-10 md:grid-cols-2 md:gap-16 ${flip ? "md:[&>*:first-child]:order-2" : ""}`}>
      <div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[12px] text-muted-foreground">{n}</span>
          <span className="h-px flex-1 bg-border" />
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            {persona}
          </span>
        </div>
        <p className="mt-5 text-[13px] italic leading-[1.55] text-muted-foreground">&ldquo;{trigger}&rdquo;</p>
        <h3 className="mt-3 font-display text-[28px] font-bold leading-[1.15] tracking-[-0.015em] md:text-[34px]">
          {title}
        </h3>
        <p className="mt-4 text-[15px] leading-[1.6] text-muted-foreground">{body}</p>
        <div className="mt-5 flex items-start gap-2.5 rounded-md border-l-2 border-primary bg-card/40 px-3 py-2.5">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
          <div className="text-[12.5px] leading-[1.5] text-foreground">{signal}</div>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-3 shadow-[0_4px_30px_-12px_rgba(0,0,0,0.4)]">
        {preview}
      </div>
    </div>
  );
}

/* ─────────── Product previews ─────────── */

function PortfolioPreview() {
  const rows = [
    { id: "FinTrack", phase: "Develop", phaseTone: "bg-[var(--state-passed)]/15 text-[var(--state-passed)]", gates: "3/4", deploys: 12, cfr: "4.1%", trend: [3, 5, 4, 6, 5, 4, 5] },
    { id: "Atlas", phase: "Design", phaseTone: "bg-[var(--state-pending)]/15 text-[var(--state-pending)]", gates: "1/3", deploys: 4, cfr: "9.2%", trend: [3, 4, 5, 6, 7, 8, 9] },
    { id: "Polaris", phase: "Release", phaseTone: "bg-[var(--autonomy-merge)]/15 text-[var(--autonomy-merge)]", gates: "4/4", deploys: 27, cfr: "1.7%", trend: [5, 4, 3, 3, 2, 2, 2] },
  ];
  return (
    <div className="overflow-hidden rounded-md">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-[11px] font-medium text-muted-foreground">/projects</span>
        <span className="font-mono text-[10px] text-muted-foreground">3 projects · 9d avg</span>
      </div>
      <div className="grid grid-cols-[1.4fr_0.9fr_0.6fr_0.5fr_0.6fr_0.7fr] gap-2 border-b border-border/60 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>Project</span><span>Phase</span><span>Gates</span><span>Deploys</span><span>CFR</span><span>Trend</span>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="grid grid-cols-[1.4fr_0.9fr_0.6fr_0.5fr_0.6fr_0.7fr] items-center gap-2 border-b border-border/30 px-3 py-2.5 text-[12px] last:border-b-0">
          <span className="font-medium text-foreground">{r.id}</span>
          <span><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${r.phaseTone}`}>{r.phase}</span></span>
          <span className="font-mono text-[11px] text-muted-foreground">{r.gates}</span>
          <span className="font-mono text-[11px] tabular-nums text-foreground">{r.deploys}</span>
          <span className="font-mono text-[11px] tabular-nums text-foreground">{r.cfr}</span>
          <Sparkline values={r.trend} tone={r.id === "Atlas" ? "down" : r.id === "Polaris" ? "up" : "flat"} />
        </div>
      ))}
    </div>
  );
}

function GatePreview() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <div className="flex items-center gap-2">
          <Milestone className="h-3.5 w-3.5 text-[var(--state-failed)]" />
          <span className="text-[12px] font-medium">Design → Development</span>
          <span className="rounded-full bg-[var(--state-failed)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--state-failed)]">
            blocked
          </span>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">gate-A4f</span>
      </div>
      <GateRow status="passed" text="ADR drafted · linked to plan" meta="conf-204" />
      <GateRow status="pending" text="ADR-0014 review" meta="@rohan · 3d" warn />
      <GateRow status="failed" text="Test coverage" meta="67% / 80% threshold" />
      <GateRow status="passed" text="Security review · skipped (no payments scope)" meta="rule-S2" />
    </div>
  );
}

function GateRow({
  status,
  text,
  meta,
  warn,
}: {
  status: "passed" | "pending" | "failed";
  text: string;
  meta: string;
  warn?: boolean;
}) {
  const dot = status === "passed" ? "bg-[var(--state-passed)]" : status === "pending" ? "bg-[var(--state-pending)]" : "bg-[var(--state-failed)]";
  return (
    <div className="flex items-center gap-2.5 rounded border border-border/40 px-2.5 py-2">
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dot}`} />
      <span className="flex-1 text-[12px] text-foreground">{text}</span>
      <span className={`font-mono text-[10px] ${warn ? "text-[var(--state-pending)]" : "text-muted-foreground"}`}>
        {meta}
      </span>
    </div>
  );
}

function ApprovalsPreview() {
  const items = [
    { who: "frontend-test-author", level: "Merge", levelTone: "var(--autonomy-merge)", what: "Add E2E tests for checkout flow", evidence: "PR #1248 · +204 −12 · 92% cov", stats: "47✓ 2↻ 0⚡" },
    { who: "deploy-orchestrator", level: "Propose", levelTone: "var(--autonomy-propose)", what: "Roll forward staging → prod", evidence: "deploy-9302 · canary 15m clean", stats: "12✓ 1↻ 0⚡" },
    { who: "schema-migrator", level: "Lead", levelTone: "var(--autonomy-lead)", what: "Add nullable column to applications", evidence: "drizzle-00f3 · reversible", stats: "104✓ 0↻ 0⚡" },
  ];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <span className="text-[12px] font-medium">/approvals</span>
        <span className="font-mono text-[10px] text-muted-foreground">12 pending · 8m clear</span>
      </div>
      {items.map((i) => (
        <div key={i.who} className="rounded-md border border-border/50 p-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3 w-3 text-primary" />
              <span className="font-mono text-[11px] text-foreground">{i.who}</span>
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: `color-mix(in oklch, ${i.levelTone} 18%, transparent)`, color: i.levelTone }}>
                {i.level}
              </span>
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">{i.stats}</span>
          </div>
          <div className="mt-1.5 text-[12px] text-foreground">{i.what}</div>
          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{i.evidence}</div>
          <div className="mt-2 flex gap-1.5">
            <span className="rounded bg-[var(--state-passed)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--state-passed)]">Approve</span>
            <span className="rounded bg-[var(--state-failed)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--state-failed)]">Reject</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AutonomyPreview() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <span className="text-[12px] font-medium">/skills</span>
        <span className="font-mono text-[10px] text-muted-foreground">autonomy ledger</span>
      </div>
      <div className="rounded-md border border-primary/30 bg-primary/[0.04] p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-[12px] text-foreground">frontend-test-author</span>
          </div>
          <span className="font-mono text-[10px] text-muted-foreground">2d ago</span>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[12px]">
          <span className="rounded-full bg-[var(--autonomy-propose)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--autonomy-propose)]">Propose</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <span className="rounded-full bg-[var(--autonomy-merge)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--autonomy-merge)]">Merge</span>
          <span className="ml-1 text-[11px] text-muted-foreground">— 30d clean</span>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border/40 pt-3 text-[11px]">
          <div><dt className="text-muted-foreground">Successes</dt><dd className="font-mono text-[14px] font-semibold text-[var(--verdict-success)]">47</dd></div>
          <div><dt className="text-muted-foreground">Rollbacks</dt><dd className="font-mono text-[14px] font-semibold text-[var(--verdict-rollback)]">2</dd></div>
          <div><dt className="text-muted-foreground">Incidents</dt><dd className="font-mono text-[14px] font-semibold text-[var(--verdict-incident)]">0</dd></div>
        </dl>
        <div className="mt-3 rounded border-l-2 border-primary bg-card px-2 py-1.5 text-[11px] text-muted-foreground">
          <span className="text-foreground">Unlocks:</span> auto-approve PRs under 150 LoC with ≥85% test coverage.
        </div>
      </div>
    </div>
  );
}

function MetricsPreview() {
  const projects = [
    { id: "FinTrack", cfr: "4.1%", trend: [3, 3, 4, 4, 3, 4, 4], tone: "flat" as const },
    { id: "Atlas", cfr: "11.4%", trend: [3, 4, 5, 6, 8, 10, 11], tone: "down" as const },
    { id: "Polaris", cfr: "1.7%", trend: [4, 3, 3, 2, 2, 2, 2], tone: "up" as const },
    { id: "Nimbus", cfr: "6.8%", trend: [4, 5, 4, 5, 7, 7, 7], tone: "down" as const },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <span className="text-[12px] font-medium">/metrics · change-failure rate (7d)</span>
        <span className="font-mono text-[10px] text-[var(--trend-down)]">▲ +4% wow</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {projects.map((p) => (
          <div key={p.id} className="rounded-md border border-border/40 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium">{p.id}</span>
              <span className={`font-mono text-[11px] tabular-nums ${
                p.tone === "down" ? "text-[var(--trend-down)]" : p.tone === "up" ? "text-[var(--trend-up)]" : "text-muted-foreground"
              }`}>{p.cfr}</span>
            </div>
            <div className="mt-2"><Sparkline values={p.trend} tone={p.tone} wide /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Sparkline({ values, tone, wide }: { values: number[]; tone: "up" | "down" | "flat"; wide?: boolean }) {
  const W = wide ? 140 : 60;
  const H = wide ? 28 : 16;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const stepX = W / (values.length - 1);
  const points = values
    .map((v, i) => `${i * stepX},${H - ((v - min) / range) * (H - 2) - 1}`)
    .join(" ");
  const stroke = tone === "up" ? "var(--trend-up)" : tone === "down" ? "var(--trend-down)" : "var(--trend-flat)";
  const lastX = (values.length - 1) * stepX;
  const lastY = H - ((values[values.length - 1] - min) / range) * (H - 2) - 1;
  return (
    <svg width={W} height={H} className="overflow-visible" aria-hidden>
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2" fill={stroke} />
    </svg>
  );
}

function McpPreview() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card font-mono text-[12px]">
      <div className="flex items-center gap-2 border-b border-border/60 bg-background/50 px-3 py-2">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--state-failed)]/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--state-pending)]/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--state-passed)]/40" />
        </div>
        <span className="ml-2 text-[11px] text-muted-foreground">Cursor · MCP call</span>
        <span className="ml-auto rounded bg-[var(--state-passed)]/15 px-1.5 py-0.5 text-[10px] text-[var(--state-passed)]">
          218ms
        </span>
      </div>
      <div className="space-y-2 p-4 leading-[1.6]">
        <div className="text-muted-foreground">→ get_my_context</div>
        <div className="rounded bg-background/40 p-3 text-[11.5px]">
          <div><span className="text-muted-foreground">project</span>: <span className="text-foreground">FinTrack</span> <span className="text-muted-foreground">[fintrack-9302]</span></div>
          <div><span className="text-muted-foreground">phase</span>: <span className="text-foreground">Development</span> <span className="text-[var(--state-pending)]">(1 pending gate)</span></div>
          <div><span className="text-muted-foreground">ticket</span>: <span className="text-foreground">FT-1024 · Checkout v2</span></div>
          <div className="mt-1 text-muted-foreground">rules in force:</div>
          <div className="pl-3 text-foreground">· no DB schema change without ADR <span className="text-muted-foreground">[rule-A11]</span></div>
          <div className="pl-3 text-foreground">· PRs &lt;150 LoC auto-mergeable by merge skills</div>
          <div className="mt-1 text-muted-foreground">callable skills:</div>
          <div className="pl-3 text-foreground">
            · frontend-test-author{" "}
            <span className="rounded bg-[var(--autonomy-merge)]/15 px-1 text-[var(--autonomy-merge)]">Merge</span>
          </div>
          <div className="pl-3 text-foreground">
            · schema-migrator{" "}
            <span className="rounded bg-[var(--autonomy-lead)]/15 px-1 text-[var(--autonomy-lead)]">Lead</span>
          </div>
          <div className="mt-1 text-muted-foreground">adrs binding:</div>
          <div className="pl-3 text-foreground">· ADR-0014 · checkout pipeline <span className="text-muted-foreground">[conf-204]</span></div>
        </div>
        <div className="flex items-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" /> grounded · every citation linked back to coznt
        </div>
      </div>
    </div>
  );
}

function IntegrationCell({
  name,
  id,
  body,
}: {
  name: string;
  id: string;
  body: string;
}) {
  return (
    <div className="bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-semibold text-foreground">{name}</div>
        <Zap className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="mt-1.5 font-mono text-[10px] text-muted-foreground">[{id}]</div>
      <div className="mt-3 text-[12px] leading-[1.5] text-muted-foreground">{body}</div>
    </div>
  );
}
