"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Compass,
  Mic,
  Sparkles,
  Target,
} from "lucide-react";
import { EyebrowHeading } from "@/components/portal/eyebrow-heading";
import type { CareerPathExplorerOutput } from "@/automations/agents/definitions/career-path-explorer";

type Path = CareerPathExplorerOutput["paths"][number];

export function ExplorePathsClient({
  summary,
  paths,
}: {
  summary: string;
  paths: Path[];
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <EyebrowHeading accent="amber">Explore</EyebrowHeading>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">
        Career paths
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{summary}</p>

      <div className="mt-8 space-y-4">
        {paths.map((path, i) => (
          <PathCard key={`${path.title}-${i}`} path={path} defaultOpen={i === 0} />
        ))}
      </div>
    </div>
  );
}

function PathCard({ path, defaultOpen }: { path: Path; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);

  return (
    <article className="rounded-2xl border border-border bg-card transition-colors hover:border-amber-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-4 p-5 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-semibold text-foreground">
              {path.title}
            </h2>
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {humanize(path.kind)}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">{path.whyItFits}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <MatchBadge score={path.matchScore} />
            <span>· timeline: {path.timeline}</span>
          </div>
        </div>
        {open ? (
          <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="space-y-5 border-t border-border px-5 pb-5 pt-4">
          {path.gaps.length > 0 && (
            <Section icon={AlertTriangle} title="Gaps">
              <ul className="space-y-1.5">
                {path.gaps.map((g, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-foreground">{g.skill}</span>
                    <SeverityBadge severity={g.severity} />
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {path.growthActions.length > 0 && (
            <Section icon={Target} title="What to do next">
              <ul className="space-y-1.5">
                {path.growthActions.map((action, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs text-foreground"
                  >
                    <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <div className="flex items-center justify-end pt-2">
            <Link
              href="/prep"
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90"
            >
              <Mic className="h-3 w-3" /> Practice with prep
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </article>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Compass;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function MatchBadge({ score }: { score: number }) {
  const tone =
    score >= 70 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-stone-500";
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${tone}`}>
      <Sparkles className="h-3 w-3" />
      Match {score}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: "minor" | "moderate" | "significant" }) {
  const styles = {
    minor: "text-stone-600 border-stone-200 bg-stone-50",
    moderate: "text-amber-600 border-amber-200 bg-amber-50/40",
    significant: "text-rose-600 border-rose-200 bg-rose-50/40",
  }[severity];
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles}`}
    >
      {severity}
    </span>
  );
}

function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
