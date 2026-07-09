import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageMeta } from "@/components/marketing/PageMeta";

export const metadata: Metadata = {
  title: "Manifesto · Coznt",
  description:
    "AI shipped faster than trust. The teams that grade autonomy from evidence will out-ship the teams that gate autonomy by policy.",
};

const SIGN_IN = "/auth/sign-in";

const CHAPTERS = [
  { n: "I", title: "The gap" },
  { n: "II", title: "The wrong answer" },
  { n: "III", title: "The right answer is older than this problem" },
  { n: "IV", title: "What we're building" },
  { n: "V", title: "The bet" },
];

export default function ManifestoPage() {
  return (
    <MarketingShell active="manifesto">
      {/* ─────────── Hero · editorial cover ─────────── */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="dot-grid absolute inset-0 opacity-40" aria-hidden />
        <div
          aria-hidden
          className="anim-pulse-soft absolute left-1/2 top-[-260px] h-[640px] w-[640px] -translate-x-1/2 rounded-full bg-primary/10 blur-[140px]"
        />
        <div className="relative mx-auto max-w-6xl px-6 pt-14 pb-16 md:pt-20 md:pb-24">
          <PageMeta
            label="Manifesto · Coznt · May 2026"
            qualifier="Five chapters · 9-minute read"
            link={{ href: SIGN_IN, text: "Get access" }}
          />

          <div className="mt-14 md:mt-20">
            <h1 className="anim-fade-up font-display text-[60px] font-bold leading-[0.9] tracking-[-0.035em] sm:text-[84px] md:text-[112px] lg:text-[136px]">
              AI shipped <br />
              faster than <br />
              <span className="text-primary">trust.</span>
            </h1>
            <div className="anim-fade-up delay-200 mt-12 grid gap-12 md:grid-cols-[1fr_1fr] md:gap-16">
              <p className="max-w-md text-[18px] leading-[1.6] text-foreground">
                The productivity layer is done. The trust layer is empty. Every engineering
                org installed Cursor and left the audit boundary at &ldquo;a human pressed
                merge.&rdquo;
                <br />
                <br />
                This is the gap. This is what we&rsquo;re building.
              </p>
              <div className="md:pt-1">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Contents
                </div>
                <ol className="mt-4 space-y-2.5 border-t border-border/40 pt-4">
                  {CHAPTERS.map((c) => (
                    <li
                      key={c.n}
                      className="grid grid-cols-[28px_1fr] items-baseline gap-3"
                    >
                      <span className="font-mono text-[11px] text-muted-foreground">{c.n}</span>
                      <span className="text-[14px] text-foreground">{c.title}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── Body ─────────── */}
      <article className="border-b border-border/60">
        <div className="mx-auto max-w-3xl px-6 py-16 md:py-24">
          <Chapter
            n="I"
            title="The gap."
            paragraphs={[
              <>
                In 2024, every engineering org installed Cursor. By 2025, half the commits in
                some codebases came from agents. By 2026, that number stopped being interesting
                &mdash; it was just where work happens now.
              </>,
              <>
                What didn&rsquo;t change: the org chart, the compliance posture, the audit
                boundary. The trust artifact is still &ldquo;a human pressed merge.&rdquo; The
                evidence packet for SOC 2 is still &ldquo;here are screenshots of approvals.&rdquo;
                Half the deploys are agent-driven and the audit log can&rsquo;t tell.
              </>,
              <>
                <strong className="text-foreground">
                  AI shipped faster than trust.
                </strong>{" "}
                Productivity is a solved problem. Provenance is not. And every engineering
                leader knows it &mdash; quietly &mdash; because the next regulator who asks
                &ldquo;which of these changes was authored by a model and what was it allowed
                to do?&rdquo; is going to land on a stack that can&rsquo;t answer.
              </>,
            ]}
          />

          <Chapter
            n="II"
            title="The wrong answer."
            paragraphs={[
              <>
                Lock it down. Add an approval queue. Air-gap the model. Make every agent ask
                permission. This is the path some companies are quietly taking.
              </>,
              <>
                It loses. It loses to the company that doesn&rsquo;t. Because productivity
                compounds and approval queues don&rsquo;t. The org that holds AI to a
                pre-2024 governance model is going to be out-shipped by the org that figures
                out how to grade autonomy in real time.
              </>,
              <>
                Governance by default-deny is a way of saying you don&rsquo;t have a
                governance model. It&rsquo;s a stall.
              </>,
            ]}
          />

          <PullQuote>
            The teams that grade autonomy from evidence will out-ship the teams that gate
            autonomy by policy.
          </PullQuote>

          <Chapter
            n="III"
            title="The right answer is older than this problem."
            paragraphs={[
              <>
                Every engineering manager already knows how to grant earned autonomy. They do
                it with new hires.
              </>,
              <>
                Day one, your new engineer doesn&rsquo;t get prod access. They don&rsquo;t
                touch the payments service. They start on docs, on tests, on a small repo with
                a blast radius of one. After a few weeks of clean PRs, they get more. After a
                few months, they ship to staging unsupervised. After a year, they&rsquo;re on
                the oncall rotation.
              </>,
              <>
                Nobody framed that progression as &ldquo;loosening governance.&rdquo; It was
                <em> earned autonomy from evidence</em>. The evidence was the work. The
                grading was the manager&rsquo;s judgment, calibrated by outcomes.
              </>,
              <>
                Agents deserve the same ladder. With shorter lookback windows, because their
                signal is denser. With deterministic outcome assessors, because the evidence
                is machine-readable. With public receipts, because nobody&rsquo;s judgment is
                trustworthy at the scale of AI throughput.
              </>,
            ]}
          />

          <Chapter
            n="IV"
            title="What we&rsquo;re building."
            paragraphs={[
              <>
                Coznt is an autonomy ledger. Every action a skill or agent takes is recorded
                with context. Every outcome is assessed against a deterministic rubric. The
                trust level of every <code className="font-mono text-[13px] text-foreground">(skill, project)</code>{" "}
                pair is recomputed from the trailing 30-day window of outcomes.
              </>,
              <>
                Merge on a docs repo doesn&rsquo;t mean merge on payments. Trust is scoped
                to the surface where it was earned. Cross-project rollups exist for the
                portfolio view. The act of promotion is per-project, because that&rsquo;s how
                enterprise compliance reasons about scope.
              </>,
              <>
                The ledger fills from your existing SDLC behavior first &mdash; PRs merged on
                time, deploys without incident, gates passed, work items closed without
                rollback. No AI required to start. The product ships and earns its first
                deals on observability alone. Agents joining the loop later use the same
                rubric the team already used.
              </>,
              <>
                Every claim on the dashboard has a receipt. Every autonomy level has 30 days
                of audit-grade history one click away. Every approval &mdash; human or
                automatic &mdash; appends to an append-only, hash-chained log.
              </>,
            ]}
          />

          <Chapter
            n="V"
            title="The bet."
            paragraphs={[
              <>
                The operating system of an engineering organization is changing. The
                question that organized it for forty years &mdash; <em>who reports to
                whom</em> &mdash; is being replaced by a different one: <em>who is allowed
                to do what, and on the basis of what evidence?</em>
              </>,
              <>
                The next decade of engineering management isn&rsquo;t about hiring more
                humans. It&rsquo;s about graduating more agents. The headcount question is
                getting smaller; the autonomy-ladder question is getting bigger.
              </>,
              <>
                The organizations that build a real ledger &mdash; one that can answer
                &ldquo;why is this skill trusted to ship to prod on this repo and not that
                one&rdquo; in a single screen with cited evidence &mdash; are going to
                out-execute the organizations that don&rsquo;t.
              </>,
              <>
                <strong className="text-foreground">
                  We&rsquo;re building the ledger.
                </strong>
              </>,
            ]}
          />

          <div className="mt-20 flex flex-col items-start gap-4 border-t border-border/40 pt-10 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Coznt
              </div>
              <div className="mt-1 font-display text-[20px] font-bold tracking-tight">
                Autonomy with observability.
              </div>
            </div>
            <div className="flex gap-3">
              <Button asChild size="lg" className="h-11 px-5">
                <Link href={SIGN_IN}>
                  Get access <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 border-border/80 bg-transparent px-5">
                <Link href="/how-it-works">How it works</Link>
              </Button>
            </div>
          </div>
        </div>
      </article>
    </MarketingShell>
  );
}

function Chapter({
  n,
  title,
  paragraphs,
}: {
  n: string;
  title: React.ReactNode;
  paragraphs: React.ReactNode[];
}) {
  return (
    <section className="mt-16 first:mt-0">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[12px] text-muted-foreground">{n}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <h2 className="mt-5 font-display text-[30px] font-bold leading-[1.15] tracking-[-0.015em] md:text-[38px]">
        {title}
      </h2>
      <div className="mt-6 space-y-5 text-[16px] leading-[1.7] text-muted-foreground">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  );
}

function PullQuote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="my-16 border-l-2 border-primary bg-card/40 px-6 py-5">
      <p className="font-display text-[22px] font-semibold leading-[1.35] tracking-[-0.01em] text-foreground md:text-[26px]">
        {children}
      </p>
    </blockquote>
  );
}
