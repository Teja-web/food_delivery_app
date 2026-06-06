import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  ArrowLeftRight,
  Box,
  Cog,
  GitBranch,
  GitPullRequest,
  ScrollText,
  Sparkles,
  Webhook,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageMeta } from "@/components/marketing/PageMeta";

export const metadata: Metadata = {
  title: "Integrations · Coznt",
  description:
    "Systems of record, IDE/agent surfaces, and CI signal sources. Coznt observes everything and replaces nothing.",
};

const SIGN_IN = "/auth/sign-in";

export default function IntegrationsPage() {
  return (
    <MarketingShell active="integrations">
      {/* ─────────── Hero · asymmetric with embedded model ─────────── */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="dot-grid absolute inset-0 opacity-40" aria-hidden />
        <div
          aria-hidden
          className="anim-pulse-soft absolute left-[-180px] top-[-200px] h-[560px] w-[560px] rounded-full bg-primary/10 blur-[140px]"
        />
        <div className="relative mx-auto max-w-7xl px-6 pt-14 pb-16 md:pt-20 md:pb-20">
          <PageMeta
            label="Integrations · Coznt"
            qualifier="Three categories · twelve systems · zero re-platforming"
            link={{ href: "/how-it-works", text: "How it works" }}
          />

          <div className="mt-14 grid gap-12 md:mt-16 md:grid-cols-[1.3fr_1fr] md:gap-16">
            {/* LEFT — Headline */}
            <div>
              <p className="anim-fade-up font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Integrations
              </p>
              <h1 className="anim-fade-up delay-100 mt-5 font-display text-[52px] font-bold leading-[0.95] tracking-[-0.03em] sm:text-[68px] md:text-[80px]">
                Observe everything. <br />
                <span className="text-primary">Replace nothing.</span>
              </h1>
              <p className="anim-fade-up delay-200 mt-7 max-w-lg text-[17px] leading-[1.65] text-foreground">
                Your tracker, your repo, your CI runner, your runbook &mdash; they all
                stay authoritative. Coznt sits next to them, reads the signal, and links
                every claim back to the system that owns the truth.
              </p>
              <p className="anim-fade-up delay-300 mt-4 max-w-lg text-[15px] leading-[1.6] text-muted-foreground">
                The model is three verbs: <span className="text-foreground">ingest</span>,{" "}
                <span className="text-foreground">attribute</span>,{" "}
                <span className="text-foreground">emit</span>. That last verb only fires when
                you invite it.
              </p>
            </div>

            {/* RIGHT — Ingest / Attribute / Emit pipeline */}
            <div className="anim-fade-up delay-200 md:translate-y-2">
              <ModelPipeline />
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── Systems of Record ─────────── */}
      <CategorySection
        kicker="Category one"
        title="Systems of record."
        body="The four sources of truth most enterprise SDLCs already trust. Coznt ingests from all four out of the box; the choice of which is authoritative for what is yours."
      >
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2">
          <IntegrationDetail
            name="GitHub"
            tag="Source code · CI · deploys"
            id="gh-pr-1234"
            icon={GitBranch}
            available
            ingest={[
              "Pull requests, reviews, merges",
              "Workflow runs, check suites, statuses",
              "Deployments via the Deployments API",
              "Webhook events for everything above",
            ]}
            emit={[
              "PR comments with governance record state",
              "Status checks for gate / approval / review outcomes",
              "Deployment annotations",
              "Branch protection metadata",
            ]}
          />
          <IntegrationDetail
            name="Jira"
            tag="Work tracking · transitions"
            id="FT-1024"
            icon={ScrollText}
            available
            ingest={[
              "Issues, epics, stories, sub-tasks",
              "Status transitions and workflow events",
              "Field history (for attribution)",
              "Custom fields mapped to plan frontmatter",
            ]}
            emit={[
              "Transition issues on plan-artifact status changes",
              "Post comments with linked plan IDs",
              "Update custom fields with autonomy state",
              "Block transitions on failed governance records",
            ]}
          />
          <IntegrationDetail
            name="Azure DevOps"
            tag="Boards · pipelines · repos"
            id="ado-3902"
            icon={Cog}
            available
            ingest={[
              "Work items and state transitions",
              "Pipeline runs and stages",
              "Pull requests and merges",
              "Repository activity",
            ]}
            emit={[
              "Work item state transitions",
              "Pipeline gate decisions",
              "PR comments with attribution",
              "Field updates",
            ]}
          />
          <IntegrationDetail
            name="Confluence"
            tag="ADRs · runbooks · policies"
            id="conf-204"
            icon={Box}
            available
            ingest={[
              "ADR pages and revision history",
              "Runbook updates",
              "Policy and rule documents",
              "Page-level metadata for attribution",
            ]}
            emit={[
              "Auto-generated ADR drafts",
              "Plan-transition summaries",
              "Audit packet exports",
              "Cross-linked references back to plans",
            ]}
          />
        </div>
      </CategorySection>

      {/* ─────────── IDE / Agent Surfaces ─────────── */}
      <CategorySection
        kicker="Category two"
        title="IDE and agent surfaces."
        body="The places work actually happens. The MCP adapter is one HTTP endpoint behind the scenes &mdash; every editor that speaks MCP is supported the same way. Plus the daemon-direct paths for editors that don&rsquo;t."
      >
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
          <AgentSurfaceCard
            name="Cursor"
            kind="MCP"
            available
            body="The flagship MCP target. coznt.get_my_context returns project, active plans, ticket, rules, callable skills with autonomy levels."
          />
          <AgentSurfaceCard
            name="Claude Code"
            kind="MCP + native"
            available
            body="MCP adapter for context; native CLI handoff for the choreography push and skill ledger writes."
          />
          <AgentSurfaceCard
            name="Cline"
            kind="MCP"
            body="Standard MCP transport. Configure once, every coznt project is accessible."
          />
          <AgentSurfaceCard
            name="Continue"
            kind="MCP"
            body="Same MCP surface. Add a single coznt provider entry to .continuerc and you&rsquo;re grounded."
          />
          <AgentSurfaceCard
            name="Zed"
            kind="MCP"
            body="MCP slash-commands map directly to coznt verbs. get_my_context, propose_plan, invoke_skill."
          />
          <AgentSurfaceCard
            name="Devin / OpenHands / Aider"
            kind="HTTP"
            body="No MCP needed. Bearer token + a few /api/v1/* endpoints. Any agent that can make HTTP calls is a first-class consumer."
          />
        </div>
      </CategorySection>

      {/* ─────────── CI / Signal sources ─────────── */}
      <CategorySection
        kicker="Category three"
        title="CI and signal sources."
        body="Coznt&rsquo;s Mode 1 outcomes need pipeline signal. We ingest from anything that emits webhooks or has a polling API; the four below are the ones we ship with first-class assessors for."
      >
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2 lg:grid-cols-4">
          <CICard name="GitHub Actions" available body="Workflow runs, deployments, check suites." />
          <CICard name="GitLab CI" body="Pipeline events, deployments, environments." />
          <CICard name="CircleCI" body="Workflow status, deploy markers, artifacts." />
          <CICard name="Buildkite" body="Build / job / agent events." />
        </div>
      </CategorySection>

      {/* ─────────── Build your own ─────────── */}
      <section className="border-b border-border/60 bg-card/30">
        <div className="mx-auto max-w-5xl px-6 py-20 md:py-24">
          <div className="grid gap-10 md:grid-cols-[1fr_1.4fr]">
            <div>
              <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Build your own
              </span>
              <h2 className="mt-3 font-display text-[28px] font-bold leading-[1.15] tracking-[-0.015em] md:text-[34px]">
                Not on this page? <br />
                <span className="text-primary">Write 20 lines.</span>
              </h2>
            </div>
            <div className="space-y-5 text-[15px] leading-[1.65] text-muted-foreground">
              <p>
                Every integration in coznt is a thin adapter on top of two primitives: a
                webhook receiver and the public REST API. If your system can post a webhook
                or accept a bearer token, you can wire it up.
              </p>
              <p className="text-foreground">
                Outcome assessors are pure functions in{" "}
                <code className="font-mono text-[13px]">src/domain/outcomes.ts</code>.
                Choreography lives in{" "}
                <code className="font-mono text-[13px]">.coznt/skills/</code>. The daemon
                stays server-side. Push the choreography, keep the daemon.
              </p>
              <div className="flex gap-3 pt-2">
                <Button asChild size="sm" className="h-9">
                  <Link href={SIGN_IN}>
                    Get API access <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="h-9 border-border/80 bg-transparent">
                  <Link href="/how-it-works">How it works</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── Closing CTA ─────────── */}
      <section className="relative overflow-hidden">
        <div className="dot-grid absolute inset-0 opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-6 py-20 text-center md:py-24">
          <h2 className="font-display text-[32px] font-bold leading-[1.15] tracking-[-0.015em] md:text-[40px]">
            Bring one repo. <br />
            <span className="text-primary">The ledger fills itself.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-md text-[15px] text-muted-foreground">
            Most design partners get their first outcome row inside 24 hours.
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

function ModelPipeline() {
  const steps: {
    n: string;
    icon: typeof Webhook;
    verb: string;
    table: string;
    body: string;
    tone?: "primary";
  }[] = [
    {
      n: "01",
      icon: Webhook,
      verb: "Ingest",
      table: "webhook_events",
      body: "Webhooks land. Events deduped, normalized, recorded.",
    },
    {
      n: "02",
      icon: ArrowLeftRight,
      verb: "Attribute",
      table: "audit_logs",
      body: "Matched to project + plan_artifact + actor. Outcome assessors run. Ledger updates.",
      tone: "primary",
    },
    {
      n: "03",
      icon: GitPullRequest,
      verb: "Emit",
      table: "when invited",
      body: "PR comment, Jira transition, Confluence link — only when you ask for it.",
    },
  ];
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[0_30px_60px_-25px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between border-b border-border/60 bg-background/40 px-4 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          integration model
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          three verbs
        </span>
      </div>
      <ol className="divide-y divide-border/30">
        {steps.map((s, i) => (
          <li
            key={s.n}
            className={`anim-fade-up grid grid-cols-[44px_28px_1fr] items-start gap-3 px-4 py-4 ${
              s.tone === "primary" ? "bg-primary/[0.04]" : ""
            }`}
            style={{ animationDelay: `${280 + i * 100}ms` }}
          >
            <span className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
              {s.n}
            </span>
            <s.icon
              className={`mt-0.5 h-4 w-4 ${s.tone === "primary" ? "text-primary" : "text-foreground"}`}
              strokeWidth={1.75}
            />
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={`font-display text-[18px] font-bold tracking-tight ${
                    s.tone === "primary" ? "text-primary" : "text-foreground"
                  }`}
                >
                  {s.verb}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">{s.table}</span>
              </div>
              <p className="mt-1 text-[12.5px] leading-[1.55] text-muted-foreground">
                {s.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <div className="border-t border-border/40 bg-card px-4 py-3">
        <p className="font-mono text-[10.5px] leading-[1.5] text-muted-foreground">
          &raquo; every event has a <span className="text-foreground">source_id</span>{" "}
          pointing back to its origin
        </p>
      </div>
    </div>
  );
}

function CategorySection({
  kicker,
  title,
  body,
  children,
}: {
  kicker: string;
  title: string;
  body: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border/60">
      <div className="mx-auto max-w-5xl px-6 py-20 md:py-24">
        <div className="mb-10 max-w-2xl">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {kicker}
          </span>
          <h2 className="mt-3 font-display text-[30px] font-bold leading-[1.15] tracking-[-0.015em] md:text-[38px]">
            {title}
          </h2>
          <p className="mt-4 text-[15px] leading-[1.6] text-muted-foreground">{body}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

function IntegrationDetail({
  name,
  tag,
  id,
  icon: Icon,
  available,
  ingest,
  emit,
}: {
  name: string;
  tag: string;
  id: string;
  icon: typeof GitBranch;
  available?: boolean;
  ingest: string[];
  emit: string[];
}) {
  return (
    <div className="bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 text-primary" strokeWidth={1.75} />
          <span className="text-[15px] font-semibold text-foreground">{name}</span>
          {available && (
            <span className="rounded-full bg-[var(--state-passed)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--state-passed)]">
              Available
            </span>
          )}
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">[{id}]</span>
      </div>
      <div className="mt-1 text-[12px] text-muted-foreground">{tag}</div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Ingest
          </div>
          <ul className="mt-2 space-y-1.5">
            {ingest.map((line) => (
              <li key={line} className="flex items-start gap-1.5 text-[12px] leading-[1.5] text-foreground">
                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-primary" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Emit
          </div>
          <ul className="mt-2 space-y-1.5">
            {emit.map((line) => (
              <li key={line} className="flex items-start gap-1.5 text-[12px] leading-[1.5] text-foreground">
                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-muted-foreground" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function AgentSurfaceCard({
  name,
  kind,
  body,
  available,
}: {
  name: string;
  kind: string;
  body: string;
  available?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-[14px] font-semibold text-foreground">{name}</span>
        </div>
        {available && (
          <span className="rounded-full bg-[var(--state-passed)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--state-passed)]">
            Available
          </span>
        )}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {kind}
      </div>
      <p className="text-[12.5px] leading-[1.55] text-muted-foreground">{body}</p>
    </div>
  );
}

function CICard({
  name,
  body,
  available,
}: {
  name: string;
  body: string;
  available?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="text-[14px] font-semibold text-foreground">{name}</span>
        </div>
        {available && (
          <span className="rounded-full bg-[var(--state-passed)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--state-passed)]">
            Available
          </span>
        )}
      </div>
      <p className="text-[12.5px] leading-[1.55] text-muted-foreground">{body}</p>
    </div>
  );
}
