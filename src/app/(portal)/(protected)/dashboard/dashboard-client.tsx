"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Inbox,
  MessageCircle,
  Sparkles,
  TrendingUp,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { dismissPortalNudge } from "@/actions/portal";
import { EmptyState } from "@/components/empty-state";
import { EyebrowHeading } from "@/components/portal/eyebrow-heading";
import { NudgeTray } from "@/components/portal/nudge-tray";
import { StatTile } from "@/components/portal/stat-tile";
import type { PublicRoleDTO } from "@/lib/anonymize";
import { formatPublicComp } from "@/lib/anonymize/format";
import { Button } from "@/components/ui/button";
import { usePortalCandidate } from "../portal-candidate-context";

export interface RevealRole {
  dto: PublicRoleDTO;
  jobId: string;
}

const TERMINAL_INTERVIEW_STATES = new Set(["cancelled", "completed", "no_show"]);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function DashboardClient({ reveal }: { reveal?: RevealRole | null }) {
  const candidate = usePortalCandidate();
  const firstName = candidate.name.split(" ")[0] || "there";
  const now = Date.now();

  // Interviews — Date crosses the RSC boundary as a string
  const allUpcomingInterviews = candidate.interviews
    .map((iv) => ({
      id: iv.interviewId,
      jobId: iv.jobId,
      jobTitle: iv.jobTitle ?? "Role",
      scheduledAtMs: iv.scheduledAt ? new Date(iv.scheduledAt as unknown as string).getTime() : 0,
      status: iv.status ?? "",
      meetingLink: (iv.meetingLink as string | null) ?? null,
      candidateToken: (iv.candidateToken as string | null) ?? null,
    }))
    .filter(
      (iv) =>
        iv.scheduledAtMs > now && !TERMINAL_INTERVIEW_STATES.has(iv.status),
    )
    .sort((a, b) => a.scheduledAtMs - b.scheduledAtMs);

  const interviewsThisWeek = allUpcomingInterviews.filter(
    (iv) => iv.scheduledAtMs < now + WEEK_MS,
  ).length;

  const offers = candidate.applications.filter((a) => a.stage === "offer");
  const otherActive = candidate.applications.filter((a) => a.stage !== "offer");

  const completeness = candidate.profileCompleteness;

  // Up Next: top-3 interviews + open offers + active apps (capped)
  const upNextInterviews = allUpcomingInterviews.slice(0, 3);
  const upNextOffers = offers.slice(0, 3);
  const upNextActive = otherActive.slice(0, Math.max(0, 5 - upNextInterviews.length - upNextOffers.length));

  const advisoryLine = composeAdvisory({
    upcomingCount: allUpcomingInterviews.length,
    nextInterview: upNextInterviews[0] ?? null,
    offerCount: offers.length,
    activeCount: candidate.applications.length,
    completeness,
    hasResume: candidate.hasResume,
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {reveal && <RevealCard reveal={reveal} />}

        {/* Header */}
        <div className="mb-8">
          <EyebrowHeading accent="amber">Dashboard</EyebrowHeading>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">
            Welcome back, {firstName}.
          </h1>
          {advisoryLine && (
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {advisoryLine}
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            value={candidate.applications.length}
            label="Active applications"
            icon={Briefcase}
            href="/roles"
          />
          <StatTile
            value={interviewsThisWeek}
            label="Interviews this week"
            icon={Calendar}
            href="/roles"
          />
          <StatTile
            value={offers.length}
            label="Open offers"
            icon={FileText}
            href="/roles"
          />
          <StatTile
            value={`${completeness}%`}
            label="Profile complete"
            icon={User}
            href="/profile"
          />
        </div>

        {/* Two-column body */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Up Next */}
          <div className="space-y-6 lg:col-span-2">
            <section className="rounded-2xl border border-border bg-card p-5">
              <EyebrowHeading className="mb-4">Up Next</EyebrowHeading>
              {upNextInterviews.length === 0 &&
              upNextOffers.length === 0 &&
              upNextActive.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  headline="Nothing pressing right now"
                  description="When you have interviews, offers, or active applications, they'll show up here."
                  cta={{ label: "Browse roles", href: "/roles" }}
                />
              ) : (
                <div className="space-y-2">
                  {upNextInterviews.map((iv) => (
                    <UpNextItem
                      key={iv.id}
                      icon={Calendar}
                      title={`${iv.jobTitle} interview`}
                      meta={timeUntil(iv.scheduledAtMs, now)}
                      href={
                        iv.meetingLink ??
                        (iv.candidateToken
                          ? `/portal/interview/${iv.candidateToken}`
                          : `/roles/${iv.jobId}`)
                      }
                    />
                  ))}
                  {upNextOffers.map((off) => (
                    <UpNextItem
                      key={off.applicationId}
                      icon={FileText}
                      title={`Offer from ${off.orgName ?? "—"}`}
                      meta={off.jobTitle ?? "Open offer"}
                      href={`/roles/${off.jobId}/offer`}
                      accent="amber"
                    />
                  ))}
                  {upNextActive.map((app) => (
                    <UpNextItem
                      key={app.applicationId}
                      icon={Briefcase}
                      title={app.jobTitle ?? "Application"}
                      meta={`${app.orgName ?? "—"} · ${stageLabel(app.stage)}`}
                      href={`/roles/${app.jobId}`}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {candidate.nudges.length > 0 && (
              <section>
                <EyebrowHeading className="mb-3">Nudges</EyebrowHeading>
                <NudgeTray
                  nudges={candidate.nudges}
                  onDismiss={(id) => dismissPortalNudge(id)}
                />
              </section>
            )}

            <section className="rounded-2xl border border-border bg-card p-5">
              <EyebrowHeading className="mb-3">Quick Links</EyebrowHeading>
              <div className="space-y-1.5">
                <QuickLink href="/coach" icon={MessageCircle} label="Talk to Coach" />
                <QuickLink href="/roles" icon={Briefcase} label="Explore roles" />
                <QuickLink href="/assessments" icon={ClipboardCheck} label="Assessments" />
                <QuickLink href="/pulse" icon={TrendingUp} label="Your pulse" />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────── Reveal card ─────────── */

function RevealCard({ reveal }: { reveal: RevealRole }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const { dto, jobId } = reveal;
  const orgName = dto.visibility === "public" ? (dto.orgName ?? "the company") : null;
  const compBand = formatPublicComp(dto);
  const location =
    dto.visibility === "public"
      ? dto.location
      : dto.visibility === "anonymized"
        ? dto.publicLabel
        : null;

  return (
    <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
          <Sparkles className="h-4 w-4 text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">
            <CheckCircle2 className="mr-1 inline h-3 w-3" />
            Application created
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold text-foreground">
            {dto.title}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {orgName ? `at ${orgName}` : location}
            {compBand ? <> · <span className="font-medium text-foreground">{compBand}</span></> : null}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href={`/roles/${jobId}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90"
            >
              View full role <ArrowRight className="h-3 w-3" />
            </Link>
            <Link
              href="/welcome"
              className="text-xs font-medium text-amber-700 transition-colors hover:text-amber-900"
            >
              Complete your profile →
            </Link>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setDismissed(true)}
          className="rounded-md text-muted-foreground/50 transition-colors hover:bg-white/50 hover:text-muted-foreground"
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </section>
  );
}

/* ─────────── helpers ─────────── */

function UpNextItem({
  icon: Icon,
  title,
  meta,
  href,
  accent,
}: {
  icon: LucideIcon;
  title: string;
  meta: string;
  href: string;
  accent?: "amber";
}) {
  const accentClass =
    accent === "amber"
      ? "border-amber-200 hover:border-amber-300 bg-amber-50/30"
      : "border-border hover:border-amber-200";
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl border ${accentClass} p-3 transition-colors`}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-amber-200 hover:bg-amber-50/30"
    >
      <Icon className="h-3.5 w-3.5 text-amber-600" />
      <span className="flex-1">{label}</span>
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
    </Link>
  );
}

function timeUntil(targetMs: number, nowMs: number): string {
  const diff = targetMs - nowMs;
  if (diff < 0) return "now";
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  const weeks = Math.round(days / 7);
  if (weeks === 1) return "in 1 week";
  return `in ${weeks} weeks`;
}

function stageLabel(stage: string): string {
  return stage.replace(/_/g, " ");
}

function composeAdvisory(args: {
  upcomingCount: number;
  nextInterview: { jobTitle: string; scheduledAtMs: number } | null;
  offerCount: number;
  activeCount: number;
  completeness: number;
  hasResume: boolean;
}): string | null {
  const { upcomingCount, nextInterview, offerCount, activeCount, completeness, hasResume } = args;

  // Highest urgency first
  if (offerCount > 0 && nextInterview) {
    return `You have ${pluralize(offerCount, "open offer")} and your next interview (${nextInterview.jobTitle}) is ${timeUntil(nextInterview.scheduledAtMs, Date.now())}.`;
  }
  if (offerCount > 1) {
    return `You have ${offerCount} open offers — review them when you're ready to decide.`;
  }
  if (offerCount === 1) {
    return `You have an open offer waiting for your response.`;
  }
  if (nextInterview) {
    return `Your ${nextInterview.jobTitle} interview is ${timeUntil(nextInterview.scheduledAtMs, Date.now())}. Prep time pays off.`;
  }
  if (upcomingCount > 1) {
    return `You have ${upcomingCount} upcoming interviews lined up.`;
  }
  if (activeCount > 0) {
    return `${pluralize(activeCount, "active application")} in flight. Keep the momentum.`;
  }
  if (!hasResume) {
    return `Add a resume to start getting matched to roles that fit.`;
  }
  if (completeness < 50) {
    return `Round out your profile to see better matches — you're at ${completeness}%.`;
  }
  return `Browse roles or take an assessment to get started.`;
}

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
