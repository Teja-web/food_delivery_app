"use client";

import Link from "next/link";
import { ArrowRight, Flame, TrendingUp } from "lucide-react";
import { dismissPortalNudge } from "@/actions/portal";
import { TalentRadar } from "@/components/portal/talent-radar";
import { TrajectoryCanvas } from "@/components/portal/trajectory-canvas";
import type { TrajectoryData } from "@/components/portal/trajectory-canvas";
import { NudgeTray, type NudgeTrayItem } from "@/components/portal/nudge-tray";
import { StatTile } from "@/components/portal/stat-tile";
import { EyebrowHeading } from "@/components/portal/eyebrow-heading";

/* -- Types --------------------------------------------------- */

interface PulseStats {
  totalInterviews: number;
  completedInterviews: number;
  totalPrepSessions: number;
  interviewTimeline: Array<{ date: string; company: string; status: string }>;
  currentStreak: number;
}

interface SkillBreakdownItem {
  name: string;
  score: number;
}

/* -- Skill Bar ---------------------------------------------- */

function SkillBar({ name, score }: { name: string; score: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold text-foreground mb-1.5">{name}</p>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all"
          style={{ width: `${score}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground text-right">{score}</p>
    </div>
  );
}

/* -- Component ----------------------------------------------- */

interface TalentAssessment {
  overall: number;
  rating: string;
  roleFamily: string;
  pillars: Array<{ pillar: string; score: number; weight: number; signals: string[] }>;
}

interface ProfileInsights {
  skillNarrative: string;
  marketPosition: string;
  topStrengths: string[];
  growthAreas: string[];
}

interface GrowthTimelineEntry {
  id: string;
  source: "prep" | "assessment";
  label: string;
  score: number;
  date: string;
  details?: { readiness?: number; communication?: number; content?: number };
}

export function PulseClient({
  stats,
  trajectory,
  skillBreakdown,
  talentAssessment,
  profileInsights,
  growthTimeline = [],
  nudges = [],
}: {
  stats: PulseStats;
  trajectory: TrajectoryData | null;
  skillBreakdown: SkillBreakdownItem[];
  talentAssessment: TalentAssessment | null;
  profileInsights: ProfileInsights | null;
  growthTimeline?: GrowthTimelineEntry[];
  nudges?: NudgeTrayItem[];
}) {
  const passRate = stats.totalInterviews > 0
    ? Math.round((stats.completedInterviews / stats.totalInterviews) * 100)
    : 0;

  const milestones = [
    { label: "Interviews", value: String(stats.totalInterviews), period: `${stats.completedInterviews} completed` },
    { label: "Pass rate", value: `${passRate}%`, period: `${stats.completedInterviews} of ${stats.totalInterviews}` },
    { label: "Prep sessions", value: String(stats.totalPrepSessions), period: stats.currentStreak > 0 ? `${stats.currentStreak} day streak` : "Start prepping" },
  ];

  const isEmpty = stats.totalInterviews === 0 && stats.totalPrepSessions === 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="space-y-10">
          {/* Header */}
          <div className="section-reveal">
            <div className="flex items-center gap-2 text-amber-600">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Career Pulse
              </span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
              How you&apos;re growing
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isEmpty
                ? "Complete interviews and prep sessions to start tracking your growth."
                : `Based on ${stats.totalInterviews} interviews and ${stats.totalPrepSessions} prep sessions.`}
            </p>
          </div>


          {/* Nudges */}
          {nudges.length > 0 && (
            <div className="section-reveal" style={{ animationDelay: "40ms" }}>
              <NudgeTray nudges={nudges} onDismiss={(id) => dismissPortalNudge(id)} />
            </div>
          )}

          {/* Profile Insights from Advisory */}
          {profileInsights && (profileInsights.skillNarrative || profileInsights.marketPosition) && (
            <section className="section-reveal rounded-xl border border-border bg-card p-5" style={{ animationDelay: "80ms" }}>
              {profileInsights.skillNarrative && (
                <div className="mb-3">
                  <EyebrowHeading className="mb-1" as="p">Your story</EyebrowHeading>
                  <p className="text-[13px] leading-relaxed text-foreground">
                    {profileInsights.skillNarrative}
                  </p>
                </div>
              )}
              {profileInsights.marketPosition && (
                <div className="rounded-lg bg-secondary/80 px-3 py-2">
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground">Market position: </span>
                    {profileInsights.marketPosition}
                  </p>
                </div>
              )}
            </section>
          )}

          {/* Skill Breakdown */}
          {skillBreakdown.length > 0 && (
            <section className="section-reveal" style={{ animationDelay: "150ms" }}>
              <div className="grid grid-cols-2 gap-3">
                {skillBreakdown.map((skill) => (
                  <SkillBar key={skill.name} name={skill.name} score={skill.score} />
                ))}
              </div>
            </section>
          )}

          {/* Milestones */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 section-reveal" style={{ animationDelay: "180ms" }}>
            {milestones.map((m, i) => (
              <div
                key={m.label}
                className="metric-enter"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <StatTile value={m.value} label={m.label} caption={m.period} />
              </div>
            ))}
          </div>

          {/* Career DNA Radar */}
          {talentAssessment && talentAssessment.pillars?.length > 0 && (
            <section className="section-reveal" style={{ animationDelay: "200ms" }}>
              <TalentRadar
                pillars={talentAssessment.pillars as any}
                overall={talentAssessment.overall}
                rating={talentAssessment.rating}
                roleFamily={talentAssessment.roleFamily}
              />
            </section>
          )}

          {/* Growth Timeline */}
          {growthTimeline.length > 0 && (
            <section className="section-reveal rounded-xl border border-border bg-card p-5" style={{ animationDelay: "250ms" }}>
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <h3 className="text-sm font-semibold text-foreground">Progress timeline</h3>
              </div>
              <div className="space-y-2">
                {growthTimeline.slice(0, 10).map((entry) => {
                  const scoreColor =
                    entry.score >= 70 ? "text-emerald-600" :
                    entry.score >= 40 ? "text-amber-600" :
                    "text-red-500";
                  const barColor =
                    entry.score >= 70 ? "bg-emerald-400" :
                    entry.score >= 40 ? "bg-amber-400" :
                    "bg-red-400";
                  return (
                    <div key={entry.id} className="flex items-center gap-3">
                      <div className="w-16 shrink-0 text-right">
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(entry.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      </div>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                        entry.source === "prep"
                          ? "bg-violet-50 text-violet-600"
                          : "bg-blue-50 text-blue-600"
                      }`}>
                        {entry.source === "prep" ? "Prep" : "Assessment"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {entry.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${entry.score}%` }} />
                        </div>
                        <span className={`w-6 text-right text-[10px] font-bold ${scoreColor}`}>
                          {entry.score}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Streak indicator */}
          {stats.currentStreak > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-200/60 bg-amber-50/30 px-5 py-3 section-reveal" style={{ animationDelay: "300ms" }}>
              <Flame className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  {stats.currentStreak} day prep streak
                </p>
                <p className="text-[11px] text-amber-700">
                  Keep it going — consistency beats intensity.
                </p>
              </div>
            </div>
          )}

          {/* Career Trajectory */}
          {trajectory && (
            <div className="section-reveal" style={{ animationDelay: "450ms" }}>
              <TrajectoryCanvas data={trajectory} />
            </div>
          )}

          {/* Bottom CTA */}
          <div className="section-reveal flex items-center gap-4 rounded-2xl border-2 border-dashed border-border bg-card/50 p-5" style={{ animationDelay: "650ms" }}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-base">
              ✦
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-foreground">Close your biggest gap</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                A prep session targets your weakest area. Ask your coach for personalized guidance.
              </p>
            </div>
            <Link
              href="/coach"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[11px] font-semibold text-primary-foreground hover:opacity-90 transition-opacity active:scale-[0.97] shrink-0"
            >
              Ask Coach
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

