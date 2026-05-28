import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  CheckCircle2,
  Compass,
  Layers,
  Lock,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageMeta } from "@/components/marketing/PageMeta";

export const metadata: Metadata = {
  title: "Pricing · Coznt",
  description:
    "We're picking our first design partners. Coznt is priced on outcomes you can measure on day one.",
};

const SIGN_IN = "/auth/sign-in";

export default function PricingPage() {
  return (
    <MarketingShell active="pricing">
      {/* ─────────── Hero · asymmetric with live slot counter ─────────── */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="dot-grid absolute inset-0 opacity-40" aria-hidden />
        <div
          aria-hidden
          className="anim-pulse-soft absolute right-[-160px] top-[-200px] h-[560px] w-[560px] rounded-full bg-primary/10 blur-[140px]"
        />
        <div className="relative mx-auto max-w-7xl px-6 pt-14 pb-16 md:pt-20 md:pb-20">
          <PageMeta
            label="Pricing · Design partner program"
            qualifier="3 of 10 slots claimed · open"
            link={{ href: "#design-partner", text: "Apply to partner" }}
          />

          <div className="mt-14 grid gap-12 md:mt-16 md:grid-cols-[1.3fr_1fr] md:gap-16">
            {/* LEFT — Headline + thesis */}
            <div>
              <p className="anim-fade-up font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Pricing
              </p>
              <h1 className="anim-fade-up delay-100 mt-5 font-display text-[52px] font-bold leading-[0.95] tracking-[-0.03em] sm:text-[68px] md:text-[80px]">
                The first <br />
                <span className="text-primary">ten orgs.</span>
              </h1>
              <p className="anim-fade-up delay-200 mt-7 max-w-lg text-[17px] leading-[1.65] text-foreground">
                Pricing should be set against the outcomes a product produces, not the
                headcount it touches. The category is new &mdash; so we&rsquo;re picking
                ten engineering orgs to figure that out with us.
              </p>
              <p className="anim-fade-up delay-300 mt-4 max-w-lg text-[15px] leading-[1.6] text-muted-foreground">
                Design-partner economics locked for 24 months. Hands-on with the founders.
                Roadmap input. First look at every milestone.
              </p>
              <div className="anim-fade-up delay-300 mt-8 flex flex-wrap items-center gap-2">
                <Button asChild size="lg" className="h-12 px-6 text-[14px]">
                  <Link href="#design-partner">
                    Apply to partner <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="ghost" className="h-12 px-4 text-[14px] text-muted-foreground hover:text-foreground">
                  <Link href="#tracks">See all tracks <ArrowRight className="ml-1 h-4 w-4" /></Link>
                </Button>
              </div>
            </div>

            {/* RIGHT — Design partner slot counter */}
            <div className="anim-fade-up delay-200 md:translate-y-2">
              <DesignPartnerSlots />
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── Three tracks ─────────── */}
      <section id="tracks" className="border-b border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
            <PlanCard
              tag="Design partner"
              tagline="The first ten."
              priceLine="Custom, outcome-tied."
              icon={Compass}
              tone="primary"
              ribbon="Available now"
              body="Hands-on with the founders. We co-design your gate definitions, autonomy thresholds, and outcome rubric against your real SDLC. You get the platform plus weekly working sessions until your ledger is producing receipts you&rsquo;d show an auditor."
              features={[
                "Direct line to the founding team",
                "Co-designed outcome rubric for your stack",
                "Custom phase gates wired to your CI/CD",
                "Hash-chained audit log from day one",
                "Locked-in design-partner economics for 24 months",
                "Roadmap input · vote on what ships next",
              ]}
              cta={{ href: "/pricing#design-partner", label: "Apply to partner" }}
              footnote="Limited to 10 organizations. Currently accepting."
            />
            <PlanCard
              tag="Team"
              tagline="When the ledger is on rails."
              priceLine="Coming after the design cohort."
              icon={Users}
              tone="muted"
              body="When the rubric is stable, pricing opens up. Self-serve for teams that want autonomy ledgers and audit logs without the founder pairing. Same product, same hash-chained audit, no white-glove."
              features={[
                "Multi-project autonomy ledger",
                "Tamper-evident audit log",
                "All four systems-of-record integrations",
                "Three input surfaces (HTTP / CLI / MCP)",
                "Org-level SSO",
                "Email support",
              ]}
              cta={{ href: SIGN_IN, label: "Join the waitlist" }}
              footnote="Pricing will be transparent. Per-project, not per-seat."
            />
            <PlanCard
              tag="Enterprise"
              tagline="When audit is the buyer."
              priceLine="Custom. Talk to us."
              icon={Lock}
              tone="muted"
              body="For engineering orgs where compliance owns the procurement question. Private deployment, customer-controlled signing keys, dedicated success engineering, and an evidence-packet builder tuned to your control framework."
              features={[
                "Single-tenant deployment available",
                "Customer-controlled DSSE signing (v2)",
                "Custom control-framework export (SOC 2, ISO, HIPAA, FedRAMP)",
                "Bundled MCP server for internal distribution",
                "Dedicated success engineer",
                "SLA-backed support",
              ]}
              cta={{ href: SIGN_IN, label: "Talk to founders" }}
              footnote="MCP server is not public npm. Internal registry / bundled only."
            />
          </div>
        </div>
      </section>

      {/* ─────────── Design partner deep-dive ─────────── */}
      <section id="design-partner" className="border-b border-border/60 bg-card/30">
        <div className="mx-auto max-w-5xl px-6 py-20 md:py-24">
          <div className="grid gap-12 md:grid-cols-[1fr_1.4fr]">
            <div>
              <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Design partner program
              </span>
              <h2 className="mt-3 font-display text-[32px] font-bold leading-[1.15] tracking-[-0.015em] md:text-[40px]">
                Ten orgs. <br />
                <span className="text-primary">Hands-on. Outcome-tied.</span>
              </h2>
              <p className="mt-5 text-[15px] leading-[1.7] text-muted-foreground">
                We&rsquo;re looking for engineering orgs with real SDLC pain &mdash; not
                hypothetical interest in AI governance. The bar is: you have agents in your
                tools already, and the audit question is bothering someone.
              </p>
            </div>
            <div className="space-y-6">
              <DetailBlock
                icon={Sparkles}
                title="What you get"
                body="Coznt platform. Founding-team office hours weekly. Co-designed gate definitions. Co-designed outcome assessors. Roadmap input. 24-month lock on design-partner economics. First look at every milestone."
              />
              <DetailBlock
                icon={CheckCircle2}
                title="What we ask"
                body="One project wired up within two weeks. Honest feedback on every release. A reference customer story when the ledger is producing receipts. Engagement from at least one eng leader and one compliance/audit stakeholder."
              />
              <DetailBlock
                icon={Layers}
                title="Who fits"
                body="50-500 engineers. Multi-project. Cursor, Devin, Copilot, or Claude Code already in the dev environment. SOC 2 or higher compliance posture. Bonus if you&rsquo;ve already tried to roll your own ledger and decided it&rsquo;s a platform problem, not a script problem."
              />
            </div>
          </div>
          <div className="mt-12 flex flex-wrap items-center gap-3 border-t border-border/40 pt-8">
            <Button asChild size="lg" className="h-11 px-5">
              <Link href={SIGN_IN}>
                Apply to partner <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11 border-border/80 bg-transparent px-5">
              <Link href="/how-it-works">See how it works</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ─────────── FAQ-ish ─────────── */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-6 py-20 md:py-24">
          <div className="mb-10 max-w-2xl">
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Pricing questions, answered straight
            </span>
            <h2 className="mt-3 font-display text-[30px] font-bold leading-[1.15] tracking-[-0.015em] md:text-[38px]">
              The honest answers.
            </h2>
          </div>
          <dl className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2">
            <FaqItem
              q="Why not a per-seat list price?"
              a="Per-seat pricing penalizes the orgs that adopt fastest. The autonomy ledger doesn&rsquo;t cost more because you have more engineers reading it &mdash; it costs more because you have more outcomes producing signal. We&rsquo;ll price against that."
            />
            <FaqItem
              q="Is there a free tier?"
              a="Not yet, and likely not ever in the traditional sense. The unit economics of a hosted, audit-grade ledger don&rsquo;t support it. We&rsquo;d rather charge a fair price than charge nothing and cut corners on the audit log."
            />
            <FaqItem
              q="What happens after the design partner cohort?"
              a="Design partners keep their economics for 24 months. Team-tier pricing opens up once the outcome rubric is stable across ten different stacks. Enterprise is always custom because audit posture is always custom."
            />
            <FaqItem
              q="Can we self-host?"
              a="On the enterprise track, yes &mdash; single-tenant deployment is available. The hosted multi-tenant path is the default because the audit chain is easier to defend when we operate it."
            />
            <FaqItem
              q="What about the open source pieces?"
              a="Choreographies (the SKILL.md files we push to your repo) are open by convention. The daemon, the ledger, and the assessor library are not. Push the choreography, keep the daemon."
            />
            <FaqItem
              q="When does Mode 2 ship for design partners?"
              a="Mode 1 is live today. The first AI agent joins the loop in the design partner phase &mdash; on a project you choose, with autonomy seeded at intern. By the time you graduate that first agent to senior, the rubric will be the one that ships to everyone."
            />
          </dl>
        </div>
      </section>

      {/* ─────────── Closing CTA ─────────── */}
      <section className="relative overflow-hidden">
        <div className="dot-grid absolute inset-0 opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-6 py-20 text-center md:py-24">
          <h2 className="font-display text-[32px] font-bold leading-[1.15] tracking-[-0.015em] md:text-[40px]">
            Ten engineering orgs. <br />
            <span className="text-primary">One ledger together.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-md text-[15px] text-muted-foreground">
            If the audit question is bothering someone in your org, you&rsquo;re early to
            something most teams will be late to.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="h-11 px-5">
              <Link href={SIGN_IN}>
                Apply to partner <ArrowRight className="ml-1.5 h-4 w-4" />
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

function DesignPartnerSlots() {
  const slots: { n: string; status: "claimed" | "open"; codename?: string }[] = [
    { n: "01", status: "claimed", codename: "Fintech · Series C" },
    { n: "02", status: "claimed", codename: "Health · Public" },
    { n: "03", status: "claimed", codename: "DevTools · Seed" },
    { n: "04", status: "open" },
    { n: "05", status: "open" },
    { n: "06", status: "open" },
    { n: "07", status: "open" },
    { n: "08", status: "open" },
    { n: "09", status: "open" },
    { n: "10", status: "open" },
  ];
  const claimedCount = slots.filter((s) => s.status === "claimed").length;
  const openCount = slots.length - claimedCount;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[0_30px_60px_-25px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between border-b border-border/60 bg-background/40 px-4 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Design partner cohort
        </span>
        <div className="flex items-center gap-1.5">
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--state-passed)]">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--state-passed)] opacity-60" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--state-passed)]">
            Open
          </span>
        </div>
      </div>

      <ul className="divide-y divide-border/30">
        {slots.map((s, i) => (
          <li
            key={s.n}
            className={`anim-fade-up grid grid-cols-[44px_24px_1fr_auto] items-center gap-3 px-4 py-2.5 ${
              s.status === "claimed" ? "bg-card" : "bg-card/60"
            }`}
            style={{ animationDelay: `${280 + i * 50}ms` }}
          >
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {s.n}
            </span>
            {s.status === "claimed" ? (
              <UserCheck className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
            ) : (
              <span className="block h-3.5 w-3.5 rounded-full border border-dashed border-border" aria-hidden />
            )}
            <span className="text-[12.5px] text-foreground">
              {s.status === "claimed" ? s.codename : <span className="text-muted-foreground">Open · accepting</span>}
            </span>
            <span
              className={`rounded-full px-1.5 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] ${
                s.status === "claimed"
                  ? "bg-primary/15 text-primary"
                  : "bg-border/50 text-muted-foreground"
              }`}
            >
              {s.status === "claimed" ? "Claimed" : "Open"}
            </span>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-3 gap-px border-t border-border/40 bg-border/60">
        <SlotStat value={String(claimedCount)} label="claimed" tone="primary" />
        <SlotStat value={String(openCount)} label="open" />
        <SlotStat value="24m" label="locked terms" />
      </div>
    </div>
  );
}

function SlotStat({ value, label, tone }: { value: string; label: string; tone?: "primary" }) {
  return (
    <div className="flex flex-col items-start gap-1 bg-card px-4 py-3">
      <span
        className={`font-display text-[20px] font-bold leading-none tabular-nums ${
          tone === "primary" ? "text-primary" : "text-foreground"
        }`}
      >
        {value}
      </span>
      <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function PlanCard({
  tag,
  tagline,
  priceLine,
  icon: Icon,
  tone,
  ribbon,
  body,
  features,
  cta,
  footnote,
}: {
  tag: string;
  tagline: string;
  priceLine: string;
  icon: typeof Compass;
  tone: "primary" | "muted";
  ribbon?: string;
  body: string;
  features: string[];
  cta: { href: string; label: string };
  footnote: string;
}) {
  return (
    <div className={`relative flex flex-col bg-card p-6 md:p-7 ${tone === "primary" ? "ring-1 ring-inset ring-primary/30" : ""}`}>
      {ribbon && (
        <span className="absolute right-4 top-4 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-primary">
          {ribbon}
        </span>
      )}
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${tone === "primary" ? "text-primary" : "text-muted-foreground"}`} strokeWidth={1.75} />
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {tag}
        </span>
      </div>
      <div className="mt-4 font-display text-[22px] font-bold leading-[1.2] tracking-[-0.01em]">
        {tagline}
      </div>
      <div className={`mt-1 font-mono text-[12px] ${tone === "primary" ? "text-primary" : "text-muted-foreground"}`}>
        {priceLine}
      </div>
      <p className="mt-5 text-[13.5px] leading-[1.6] text-muted-foreground">{body}</p>
      <ul className="mt-5 space-y-2 border-t border-border/40 pt-4">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-[12.5px] text-foreground">
            <CheckCircle2 className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${tone === "primary" ? "text-primary" : "text-muted-foreground"}`} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex-1" />
      <Button asChild size="sm" variant={tone === "primary" ? "default" : "outline"} className="mt-2 h-10">
        <Link href={cta.href}>
          {cta.label} <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Link>
      </Button>
      <p className="mt-3 font-mono text-[10px] text-muted-foreground">{footnote}</p>
    </div>
  );
}

function DetailBlock({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Sparkles;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 rounded-md border border-border/60 bg-card/40 p-4">
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" strokeWidth={1.75} />
      <div>
        <div className="text-[14px] font-semibold text-foreground">{title}</div>
        <p className="mt-1.5 text-[13px] leading-[1.6] text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div className="bg-card p-6">
      <dt className="font-display text-[16px] font-semibold tracking-tight text-foreground">
        {q}
      </dt>
      <dd className="mt-2 text-[13.5px] leading-[1.65] text-muted-foreground">{a}</dd>
    </div>
  );
}
