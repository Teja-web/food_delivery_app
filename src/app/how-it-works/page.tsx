import Link from "next/link";
import type { Metadata } from "next";
import {
  Activity,
  ArrowRight,
  Code2,
  Compass,
  FileText,
  GitBranch,
  Milestone,
  Radio,
  ScrollText,
  Shield,
  Sparkles,
  Terminal,
  TestTube,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageMeta } from "@/components/marketing/PageMeta";

export const metadata: Metadata = {
  title: "How it works · Coznt",
  description:
    "The loop that turns SDLC activity into an autonomy ledger. Modes, phases, surfaces, sources of truth.",
};

const SIGN_IN = "/auth/sign-in";

export default function HowItWorksPage() {
  return (
    <MarketingShell active="how">
      {/* ─────────── Hero · loop diagram is the hero ─────────── */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="dot-grid absolute inset-0 opacity-40" aria-hidden />
        <div
          aria-hidden
          className="anim-pulse-soft absolute left-[-160px] top-[-200px] h-[560px] w-[560px] rounded-full bg-primary/10 blur-[140px]"
        />
        <div className="relative mx-auto max-w-7xl px-6 pt-14 pb-16 md:pt-20 md:pb-20">
          <PageMeta
            label="How it works · Coznt · May 2026"
            qualifier="One loop · five tables · the whole product"
            link={{ href: "/manifesto", text: "Read the manifesto" }}
          />

          <div className="mt-14 max-w-3xl">
            <p className="anim-fade-up font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              How it works
            </p>
            <h1 className="anim-fade-up delay-100 mt-5 font-display text-[52px] font-bold leading-[0.95] tracking-[-0.03em] sm:text-[68px] md:text-[88px]">
              One loop. <br />
              <span className="text-primary">Five tables.</span>
            </h1>
            <p className="anim-fade-up delay-200 mt-7 max-w-2xl text-[17px] leading-[1.65] text-foreground">
              Every architectural decision in coznt is judged against this loop. Five
              tables move state from action to earned autonomy &mdash; nothing more,
              nothing less.
            </p>
          </div>

          {/* The loop, front and center */}
          <div className="anim-fade-up delay-300 mt-14">
            <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-5">
              <LoopNode
                n="01"
                title="Action"
                body="A PR merges. A deploy ships. A gate evaluates. An agent invokes a skill."
                table="webhook_events"
              />
              <LoopNode
                n="02"
                title="Recorded"
                body="With full context — actor, project, phase, prior state, source-of-record link."
                table="audit_logs"
              />
              <LoopNode
                n="03"
                title="Assessed"
                body="Deterministic assessors verdict the outcome: success, rolled back, or incident."
                table="skill_outcomes"
              />
              <LoopNode
                n="04"
                title="Ledger"
                body="Trust accumulates per (skill, project). 30-day window. Recomputed on every outcome."
                table="skill_autonomy"
              />
              <LoopNode
                n="05"
                title="Next action"
                body="Friction drops where evidence supports it. Auto-approve, or routed to a human."
                table="rules + phase_gates"
                last
              />
            </div>
            <p className="mt-6 max-w-3xl text-[14px] leading-[1.6] text-muted-foreground">
              Every feature either{" "}
              <span className="text-foreground">tightens the loop</span> (faster signal from
              action to ledger), <span className="text-foreground">makes one side cheaper</span>{" "}
              (more observation per dollar, more autonomy per outcome), or it&rsquo;s
              plumbing. If a feature does none of those, it doesn&rsquo;t ship.
            </p>
          </div>
        </div>
      </section>

      {/* ─────────── Idea 1: Two modes ─────────── */}
      <Idea
        n="01"
        kicker="Idea one"
        title="Two modes, in sequence."
        body={
          <>
            An autonomy ledger only works if it has signal. Coznt fills it from your
            existing SDLC behavior first &mdash; before a single agent is in the loop. Once
            a project has a baseline of observed outcomes, AI agents join, using the same
            rubric the humans did.
          </>
        }
      >
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2">
          <ModeCard
            tag="Mode 1 · Today"
            title="Ledger fills from deterministic signal."
            points={[
              { label: "PR merged on time", value: "no rollback in 7d" },
              { label: "Deploy clean", value: "no incident in 24h" },
              { label: "Phase gate passed", value: "criteria checked" },
              { label: "Work item closed", value: "no revert in window" },
            ]}
            tone="primary"
          />
          <ModeCard
            tag="Mode 2 · Forward-looking"
            title="Agents append outcomes the same way."
            points={[
              { label: "Agent invocation", value: "→ outcome row, same shape" },
              { label: "Per-project autonomy", value: "not per-skill" },
              { label: "Threshold on dispatch", value: "auto vs. routed" },
              { label: "Earned trust is portable", value: "scope is not" },
            ]}
            tone="muted"
          />
        </div>
      </Idea>

      {/* ─────────── Idea 2: Per-project autonomy ─────────── */}
      <Idea
        n="02"
        kicker="Idea two"
        title="Autonomy is per project, not per skill."
        body={
          <>
            A skill that is senior-level on a docs-only repo restarts at intern on a
            payments service. Trust is scoped to where it was earned. This matches how
            enterprise compliance already reasons about blast radius.
          </>
        }
      >
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
            <span className="font-mono text-[12px] text-foreground">schema-migrator</span>
            <span className="font-mono text-[11px] text-muted-foreground">
              autonomy by project · 30d window
            </span>
          </div>
          <div className="divide-y divide-border/40">
            <AutonomyRow project="docs-site" level="Principal" stats="64✓ / 0↻ / 0⚡" tone="var(--autonomy-principal)" />
            <AutonomyRow project="marketing-app" level="Senior" stats="22✓ / 1↻ / 0⚡" tone="var(--autonomy-senior)" />
            <AutonomyRow project="api-gateway" level="Junior" stats="9✓ / 0↻ / 0⚡" tone="var(--autonomy-junior)" />
            <AutonomyRow project="payments-service" level="Intern" stats="0✓ / 0↻ / 0⚡" tone="var(--autonomy-intern)" note="new binding · onboarding" />
          </div>
        </div>
      </Idea>

      {/* ─────────── Idea 3: Six phases ─────────── */}
      <Idea
        n="03"
        kicker="Idea three"
        title="Six phases. Every project is in exactly one."
        body={
          <>
            A project advances by passing a gate on its current phase. Each phase has its
            own characteristic plan kind, its own characteristic outcome assessors, and its
            own characteristic autonomy events. The transitions are the loop.
          </>
        }
      >
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3 lg:grid-cols-6">
          <PhaseCell n="01" icon={FileText} title="Requirements" gate="Acceptance criteria signed" plan="story" />
          <PhaseCell n="02" icon={Compass} title="Design" gate="ADR reviewed · linked" plan="adr" />
          <PhaseCell n="03" icon={Code2} title="Development" gate="PR · tests · review" plan="feature" />
          <PhaseCell n="04" icon={TestTube} title="Testing" gate="Coverage ≥ threshold" plan="test_plan" />
          <PhaseCell n="05" icon={Zap} title="CI/CD" gate="Deploy clean · canary" plan="release_plan" />
          <PhaseCell n="06" icon={Activity} title="Monitoring" gate="No incident in window" plan="incident" />
        </div>
      </Idea>

      {/* ─────────── Idea 4: Three surfaces ─────────── */}
      <Idea
        n="04"
        kicker="Idea four"
        title="Three input surfaces. The loop is the product."
        body={
          <>
            MCP is one of three input surfaces, not the primary one. Every entry point hits
            the same governed API and writes to the same ledger. The daemon stays
            server-side so every LLM call is validated, audited, and ledgered.
          </>
        }
      >
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
          <SurfaceCard
            icon={Radio}
            kind="HTTP API"
            syntax="GET /api/v1/context"
            body="Bearer token, project-scoped. Any agent, any editor, any CI job. JSON in, JSON out."
          />
          <SurfaceCard
            icon={Terminal}
            kind="CLI"
            syntax="npx coznt context"
            body="Thin wrapper. Reads .coznt/config.json. Zero SDK. cURL works just as well."
          />
          <SurfaceCard
            icon={Sparkles}
            kind="MCP"
            syntax="coznt.get_my_context"
            body="Optional adapter over HTTP. Plugs into Cursor, Claude Code, Cline, Continue, Zed."
          />
        </div>
      </Idea>

      {/* ─────────── Sources of truth ─────────── */}
      <section className="border-b border-border/60 bg-card/30">
        <div className="mx-auto max-w-5xl px-6 py-20 md:py-24">
          <div className="mb-10 max-w-2xl">
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              For engineers
            </span>
            <h2 className="mt-3 font-display text-[30px] font-bold leading-[1.15] tracking-[-0.015em] md:text-[38px]">
              Two sources of truth. <span className="text-primary">Nothing else.</span>
            </h2>
            <p className="mt-4 text-[15px] text-muted-foreground">
              Every data type in coznt derives from exactly one of two source-of-truth
              files. No manual TypeScript interfaces. No drift between layers.
            </p>
          </div>
          <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2">
            <TruthCard
              icon={GitBranch}
              tag="DB shape"
              title="Drizzle schema"
              body="src/db/schema/*.ts owns table shape, relations, and inferred select types. The serializer transforms; the client renders. No hand-written interfaces."
            />
            <TruthCard
              icon={ScrollText}
              tag="AI I/O"
              title="Zod schemas"
              body="src/automations/agents/definitions/*.ts owns the AI output shape. generate() validates against it and retries on failure. The same schema feeds the type system."
            />
          </div>
        </div>
      </section>

      {/* ─────────── Tamper-evident audit ─────────── */}
      <section className="border-b border-border/60">
        <div className="mx-auto grid max-w-5xl gap-10 px-6 py-20 md:grid-cols-[1fr_1.4fr] md:py-24">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Audit posture
            </span>
            <h2 className="mt-3 font-display text-[30px] font-bold leading-[1.15] tracking-[-0.015em] md:text-[38px]">
              Tamper-evident by construction.
            </h2>
          </div>
          <div className="space-y-5 text-[15px] leading-[1.7] text-muted-foreground">
            <p>
              Every <code className="font-mono text-[13px] text-foreground">audit_logs</code>{" "}
              row is hash-chained. <code className="font-mono text-[13px] text-foreground">row_hash</code>{" "}
              = sha256(<code className="font-mono text-[13px] text-foreground">prev_hash</code>{" "}
              ‖ canonical field concat), maintained by a BEFORE INSERT trigger under a
              per-org advisory lock.
            </p>
            <p className="text-foreground">
              <code className="font-mono text-[13px]">POST /api/v1/audit/verify</code>{" "}
              walks the chain and reports the first divergence. The &ldquo;Verify
              chain&rdquo; button on the audit page does the same. Customer-controlled DSSE
              signing is a v2 surface.
            </p>
            <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/[0.04] px-3 py-2.5">
              <Shield className="h-4 w-4 flex-shrink-0 text-primary" strokeWidth={1.75} />
              <span className="text-[13px] text-foreground">
                Exports are byte-stable. Diff yesterday&rsquo;s packet against today&rsquo;s
                to spot drift before the auditor does.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── Closing CTA ─────────── */}
      <section className="relative overflow-hidden">
        <div className="dot-grid absolute inset-0 opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-6 py-20 text-center md:py-24">
          <h2 className="font-display text-[32px] font-bold leading-[1.15] tracking-[-0.015em] md:text-[40px]">
            Read the manifesto. <br />
            <span className="text-primary">Then come build with us.</span>
          </h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="h-11 px-5">
              <Link href={SIGN_IN}>
                Get access <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11 border-border/80 bg-transparent px-5">
              <Link href="/manifesto">Read the manifesto</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

function LoopNode({
  n,
  title,
  body,
  table,
  last,
}: {
  n: string;
  title: string;
  body: string;
  table: string;
  last?: boolean;
}) {
  return (
    <div className="relative flex flex-col gap-3 bg-card p-4 md:p-5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted-foreground">{n}</span>
        {!last && (
          <ArrowRight className="hidden h-4 w-4 text-muted-foreground/50 md:block" />
        )}
      </div>
      <div className="text-[14px] font-semibold tracking-tight text-foreground">{title}</div>
      <p className="text-[12px] leading-[1.5] text-muted-foreground">{body}</p>
      <code className="mt-auto inline-block font-mono text-[10px] text-muted-foreground">
        {table}
      </code>
    </div>
  );
}

function Idea({
  n,
  kicker,
  title,
  body,
  children,
}: {
  n: string;
  kicker: string;
  title: string;
  body: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border/60">
      <div className="mx-auto max-w-5xl px-6 py-20 md:py-24">
        <div className="mb-10 grid gap-8 md:grid-cols-[1fr_1.6fr]">
          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[12px] text-muted-foreground">{n}</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <span className="mt-3 inline-block text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {kicker}
            </span>
            <h2 className="mt-3 font-display text-[28px] font-bold leading-[1.15] tracking-[-0.015em] md:text-[34px]">
              {title}
            </h2>
          </div>
          <p className="text-[15px] leading-[1.7] text-muted-foreground md:pt-12">{body}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

function ModeCard({
  tag,
  title,
  points,
  tone,
}: {
  tag: string;
  title: string;
  points: { label: string; value: string }[];
  tone: "primary" | "muted";
}) {
  return (
    <div className="bg-card p-6 md:p-8">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        <span className={`h-1.5 w-1.5 rounded-full ${tone === "primary" ? "bg-primary" : "bg-muted-foreground/50"}`} />
        {tag}
      </div>
      <h3 className="mt-4 font-display text-[22px] font-bold leading-[1.2] tracking-[-0.01em]">
        {title}
      </h3>
      <ul className="mt-5 space-y-2.5 border-t border-border/40 pt-4 font-mono text-[12px]">
        {points.map((p) => (
          <li key={p.label} className="flex items-baseline justify-between gap-3">
            <span className="text-foreground">{p.label}</span>
            <span className="text-muted-foreground">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AutonomyRow({
  project,
  level,
  stats,
  tone,
  note,
}: {
  project: string;
  level: string;
  stats: string;
  tone: string;
  note?: string;
}) {
  return (
    <div className="grid grid-cols-[1.4fr_1fr_1fr_auto] items-center gap-3 px-4 py-2.5 text-[13px]">
      <span className="font-mono text-foreground">{project}</span>
      <span>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{
            backgroundColor: `color-mix(in oklch, ${tone} 18%, transparent)`,
            color: tone,
          }}
        >
          {level}
        </span>
      </span>
      <span className="font-mono text-[11px] text-muted-foreground">{stats}</span>
      <span className="font-mono text-[11px] text-muted-foreground">{note ?? ""}</span>
    </div>
  );
}

function PhaseCell({
  n,
  icon: Icon,
  title,
  gate,
  plan,
}: {
  n: string;
  icon: typeof FileText;
  title: string;
  gate: string;
  plan: string;
}) {
  return (
    <div className="flex flex-col gap-3 bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted-foreground">{n}</span>
        <Icon className="h-4 w-4 text-primary" strokeWidth={1.75} />
      </div>
      <div className="text-[14px] font-semibold tracking-tight">{title}</div>
      <div className="flex items-start gap-1.5 text-[11px] leading-[1.45] text-muted-foreground">
        <Milestone className="mt-0.5 h-3 w-3 flex-shrink-0 text-[var(--state-pending)]" />
        <span>{gate}</span>
      </div>
      <div className="font-mono text-[10px] text-muted-foreground">plan.kind = {plan}</div>
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

function TruthCard({
  icon: Icon,
  tag,
  title,
  body,
}: {
  icon: typeof FileText;
  tag: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col gap-4 bg-card p-6 md:p-8">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" strokeWidth={1.75} />
        {tag}
      </div>
      <h3 className="font-display text-[22px] font-bold leading-[1.2] tracking-[-0.01em]">
        {title}
      </h3>
      <p className="text-[14px] leading-[1.65] text-muted-foreground">{body}</p>
    </div>
  );
}
