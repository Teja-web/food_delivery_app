import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock,
  Milestone,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";

const SIGN_IN = "/auth/sign-in";

export function MarketingLanding() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      {/* ─────────── Nav ─────────── */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-6 w-6 text-primary" />
            <span className="font-display text-[17px] font-bold tracking-tight">coznt</span>
          </Link>
          <nav className="hidden items-center gap-7 text-[13px] text-muted-foreground md:flex">
            <a href="#moments" className="transition-colors hover:text-foreground">Product</a>
            <a href="#trust" className="transition-colors hover:text-foreground">Trust model</a>
            <a href="#mcp" className="transition-colors hover:text-foreground">For Cursor</a>
            <a href="#integrations" className="transition-colors hover:text-foreground">Integrations</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href={SIGN_IN} className="hidden text-[13px] text-muted-foreground transition-colors hover:text-foreground sm:block">
              Sign in
            </Link>
            <Button asChild size="sm" className="h-8">
              <Link href={SIGN_IN}>
                Get access <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ─────────── Hero ─────────── */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="dot-grid absolute inset-0 opacity-60" aria-hidden />
        <div
          aria-hidden
          className="anim-pulse-soft absolute left-1/2 top-[-220px] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/12 blur-[120px]"
        />
        <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-24 md:pt-28 md:pb-32">
          <div className="anim-fade-up mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              For governed engineering organizations
            </span>
            <h1 className="mt-6 font-display text-[44px] font-bold leading-[1.05] tracking-[-0.02em] sm:text-[60px] md:text-[72px]">
              Autonomy <span className="text-primary">with</span><br />
              observability.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-[16px] leading-[1.55] text-muted-foreground">
              AI agents earn the right to do more. Humans always see what they did and why. Coznt
              is the loop that lets you ship faster <em>and</em> show your work.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="h-11 px-5">
                <Link href={SIGN_IN}>
                  Get access <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 border-border/80 bg-transparent px-5">
                <a href="#moments">See how it works</a>
              </Button>
            </div>
          </div>

          {/* Trust signal preview strip */}
          <div className="anim-fade-up delay-200 mx-auto mt-16 max-w-5xl">
            <TrustSignalStrip />
          </div>
        </div>
      </section>

      {/* ─────────── Thesis ─────────── */}
      <section id="trust" className="border-b border-border/60">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 md:grid-cols-[1fr_1.4fr] md:py-28">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">The thesis</span>
            <h2 className="mt-3 font-display text-[34px] font-bold leading-[1.1] tracking-[-0.015em] md:text-[42px]">
              Every claim has a receipt.
            </h2>
          </div>
          <div className="space-y-6 text-[15px] leading-[1.6] text-muted-foreground">
            <p>
              The peer set isn't Notion or Asana. It's Linear, Vercel, Datadog. Every pixel earns its
              place — and every number on screen links back to its source of record.
            </p>
            <p className="text-foreground">
              Skill autonomy is a level, not vibes. Gate state is deterministic, not narrative. DORA
              attribution is causal, not correlative. The audit posture is visible in the UI before
              it's queryable from the database.
            </p>
            <ul className="grid grid-cols-1 gap-3 pt-2 text-[13px] sm:grid-cols-2">
              <ThesisPoint icon={Sparkles} title="Governed skills" body="Intern → Junior → Senior → Principal. Promotion has 30d receipts." />
              <ThesisPoint icon={Milestone} title="Deterministic gates" body="Same project state always yields the same gate result. Diffs shown." />
              <ThesisPoint icon={Activity} title="Causal DORA" body="Spike attributed to specific deploys, skills, and autonomy state at the time." />
              <ThesisPoint icon={Shield} title="Signed audit log" body="Reviewer recorded with session ID at the time, not their current role." />
            </ul>
          </div>
        </div>
      </section>

      {/* ─────────── The five moments ─────────── */}
      <section id="moments" className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
          <div className="mb-16 max-w-2xl">
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Five moments</span>
            <h2 className="mt-3 font-display text-[34px] font-bold leading-[1.1] tracking-[-0.015em] md:text-[42px]">
              Designed for the workdays that hurt today.
            </h2>
            <p className="mt-4 text-[15px] text-muted-foreground">
              Not a feature list. Five trigger-to-outcome loops, each with a visible trust signal that
              wasn't possible before.
            </p>
          </div>

          <div className="space-y-20">
            <Moment
              n="01"
              persona="Sam · Team Lead"
              trigger="Friday afternoon: 'Quick status across all your projects before Monday?'"
              title="The portfolio sweep, in 90 seconds."
              body="Open /projects. Every project's phase, blocking gates, autonomy events this week, deploy count, change-failure trend — at a glance. Drop the link in Slack."
              signal="Every claim is one click from its source of record. No coznt-only numbers."
              preview={<PortfolioPreview />}
            />
            <Moment
              n="02"
              persona="Sam · Team Lead"
              trigger="The Design → Development gate fails."
              title="Named unmet criteria. With the next action."
              body="Not 'gate failed.' Instead: 'ADR-0014 review pending @rohan since Tuesday; resume_text coverage at 67% (gate: 80%).' Each criterion has assignee, link, expected SLA."
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
              signal="Skill track record visible inline: 'Senior · 47✓ / 2↻ / 0⚡ (30d).'"
              preview={<ApprovalsPreview />}
            />
            <Moment
              n="04"
              persona="Priya · Director of Engineering"
              trigger="Friday review. A skill has been clean for 30 days."
              title="Junior → Senior. With receipts."
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
              signal="Attribution is causal, not correlative. Click the spike — three deploys, one skill, autonomy state at the time of each deploy."
              preview={<MetricsPreview />}
            />
          </div>
        </div>
      </section>

      {/* ─────────── MCP / Cursor moment ─────────── */}
      <section id="mcp" className="border-b border-border/60 bg-card/30">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 md:grid-cols-2 md:py-28">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">For Devin · Senior Eng</span>
            <h2 className="mt-3 font-display text-[34px] font-bold leading-[1.1] tracking-[-0.015em] md:text-[42px]">
              Cursor calls coznt. <br />
              <span className="text-primary">Grounded in &lt;1s.</span>
            </h2>
            <p className="mt-5 text-[15px] leading-[1.6] text-muted-foreground">
              Devin opens Cursor in a new repo. First message: <em>"What should I be working on?"</em>{" "}
              Cursor calls coznt's MCP <code className="font-mono text-[13px] text-foreground">get_my_context</code>.
              It comes back with the project, phase, his ticket, rules in force, and the skills he can
              invoke — every claim a linked URL back to coznt.
            </p>
            <p className="mt-4 text-[13px] text-muted-foreground">
              No copy-paste. No stale README excerpts. If the response cites the wrong project, the
              structure makes it obvious — wrong title at the top.
            </p>
            <div className="mt-6">
              <Link href={SIGN_IN} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline">
                Wire up the MCP endpoint <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
          <McpPreview />
        </div>
      </section>

      {/* ─────────── Integrations ─────────── */}
      <section id="integrations" className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-6 py-16 md:py-20">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
            <div>
              <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Adapter bindings</span>
              <h2 className="mt-3 font-display text-[28px] font-bold leading-[1.15] tracking-[-0.015em] md:text-[32px]">
                Plug into the systems of record you already trust.
              </h2>
            </div>
            <p className="max-w-md text-[13px] text-muted-foreground">
              Coznt doesn't replace your tracker, repo, or runbook. It coordinates them — and
              attributes every claim back to the underlying source.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-4">
            <IntegrationCell name="GitHub" id="gh-pr-1234" body="Pull requests · deployments · checks" />
            <IntegrationCell name="Jira" id="FT-1024" body="Work items · transitions · statuses" />
            <IntegrationCell name="Azure DevOps" id="ado-3902" body="Pipelines · boards · repos" />
            <IntegrationCell name="Confluence" id="conf-204" body="ADRs · runbooks · policies" />
          </div>
        </div>
      </section>

      {/* ─────────── Closing CTA ─────────── */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="dot-grid absolute inset-0 opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-6 py-24 text-center md:py-32">
          <h2 className="font-display text-[36px] font-bold leading-[1.1] tracking-[-0.02em] md:text-[48px]">
            Start with one project.<br />
            <span className="text-primary">Auditability follows for free.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-md text-[15px] text-muted-foreground">
            Wire up GitHub. Import a plan. Watch the first skill run pass a gate with receipts.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="h-11 px-5">
              <Link href={SIGN_IN}>
                Get access <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11 border-border/80 bg-transparent px-5">
              <Link href={SIGN_IN}>Sign in</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ─────────── Footer ─────────── */}
      <footer className="border-t border-border/40">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-6 py-10 md:flex-row md:items-center">
          <div className="flex items-center gap-2">
            <Logo className="h-5 w-5 text-primary" />
            <span className="font-display text-[14px] font-semibold">coznt</span>
            <span className="ml-3 text-[12px] text-muted-foreground">
              AI-native SDLC, made auditable.
            </span>
          </div>
          <div className="flex items-center gap-6 text-[12px] text-muted-foreground">
            <Link href={SIGN_IN} className="transition-colors hover:text-foreground">Sign in</Link>
            <a href="#moments" className="transition-colors hover:text-foreground">Product</a>
            <a href="#mcp" className="transition-colors hover:text-foreground">For Cursor</a>
            <span className="font-mono text-[11px]">© 2026 Coznt</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════ */

function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M8 12h8M12 8v8" />
    </svg>
  );
}

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

function TrustSignalStrip() {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
      <SignalCell label="Autonomy" rows={[
        { dot: "bg-[var(--autonomy-intern)]", text: "Intern" },
        { dot: "bg-[var(--autonomy-junior)]", text: "Junior" },
        { dot: "bg-[var(--autonomy-senior)]", text: "Senior" },
        { dot: "bg-[var(--autonomy-principal)]", text: "Principal" },
      ]} />
      <SignalCell label="Gate state" rows={[
        { dot: "bg-[var(--state-passed)]", text: "passed" },
        { dot: "bg-[var(--state-pending)]", text: "pending" },
        { dot: "bg-[var(--state-failed)]", text: "failed" },
        { dot: "bg-[var(--state-skipped)]", text: "skipped" },
      ]} />
      <SignalCell label="Verdict" rows={[
        { dot: "bg-[var(--verdict-success)]", text: "success" },
        { dot: "bg-[var(--verdict-rollback)]", text: "rolled back" },
        { dot: "bg-[var(--verdict-incident)]", text: "incident" },
      ]} />
      <SignalCell label="Trend" rows={[
        { dot: "bg-[var(--trend-up)]", text: "improving" },
        { dot: "bg-[var(--trend-flat)]", text: "flat" },
        { dot: "bg-[var(--trend-down)]", text: "regression" },
      ]} />
    </div>
  );
}

function SignalCell({
  label,
  rows,
}: {
  label: string;
  rows: { dot: string; text: string }[];
}) {
  return (
    <div className="bg-card p-4">
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <ul className="mt-3 space-y-1.5">
        {rows.map((r) => (
          <li key={r.text} className="flex items-center gap-2 text-[12px] font-mono">
            <span className={`h-1.5 w-1.5 rounded-full ${r.dot}`} />
            <span className="text-foreground">{r.text}</span>
          </li>
        ))}
      </ul>
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
        <p className="mt-5 text-[13px] italic leading-[1.55] text-muted-foreground">"{trigger}"</p>
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
    { id: "Polaris", phase: "Release", phaseTone: "bg-[var(--autonomy-senior)]/15 text-[var(--autonomy-senior)]", gates: "4/4", deploys: 27, cfr: "1.7%", trend: [5, 4, 3, 3, 2, 2, 2] },
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
      <GateRow status="failed" text="resume_text coverage" meta="67% / 80% threshold" />
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
    { who: "frontend-test-author", level: "Senior", levelTone: "var(--autonomy-senior)", what: "Add E2E tests for resume upload", evidence: "PR #1248 · +204 −12 · 92% cov", stats: "47✓ 2↻ 0⚡" },
    { who: "deploy-orchestrator", level: "Junior", levelTone: "var(--autonomy-junior)", what: "Roll forward staging → prod", evidence: "deploy-9302 · canary 15m clean", stats: "12✓ 1↻ 0⚡" },
    { who: "schema-migrator", level: "Principal", levelTone: "var(--autonomy-principal)", what: "Add nullable column to applications", evidence: "drizzle-00f3 · reversible", stats: "104✓ 0↻ 0⚡" },
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
            <button className="rounded bg-[var(--state-passed)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--state-passed)]">Approve</button>
            <button className="rounded bg-[var(--state-failed)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--state-failed)]">Reject</button>
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
          <span className="rounded-full bg-[var(--autonomy-junior)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--autonomy-junior)]">Junior</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <span className="rounded-full bg-[var(--autonomy-senior)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--autonomy-senior)]">Senior</span>
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
          <div><span className="text-muted-foreground">phase</span>: <span className="text-foreground">Develop</span> <span className="text-[var(--state-pending)]">(1 pending gate)</span></div>
          <div><span className="text-muted-foreground">ticket</span>: <span className="text-foreground">FT-1024 · Resume upload v2</span></div>
          <div className="mt-1 text-muted-foreground">rules in force:</div>
          <div className="pl-3 text-foreground">· no DB schema change without ADR <span className="text-muted-foreground">[rule-A11]</span></div>
          <div className="pl-3 text-foreground">· PRs &lt;150 LoC auto-mergeable by senior skills</div>
          <div className="mt-1 text-muted-foreground">callable skills:</div>
          <div className="pl-3 text-foreground">
            · frontend-test-author{" "}
            <span className="rounded bg-[var(--autonomy-senior)]/15 px-1 text-[var(--autonomy-senior)]">Senior</span>
          </div>
          <div className="pl-3 text-foreground">
            · schema-migrator{" "}
            <span className="rounded bg-[var(--autonomy-principal)]/15 px-1 text-[var(--autonomy-principal)]">Principal</span>
          </div>
          <div className="mt-1 text-muted-foreground">adrs binding:</div>
          <div className="pl-3 text-foreground">· ADR-0014 · resume parsing pipeline <span className="text-muted-foreground">[conf-204]</span></div>
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
