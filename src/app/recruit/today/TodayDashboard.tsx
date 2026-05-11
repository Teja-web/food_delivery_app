"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Sparkles,
  Sun,
} from "lucide-react";
import { useEntityEvent } from "@/hooks/use-entity-event";
import type {
  TodayClientProps,
} from "./serialize";

/* -- Helpers --------------------------------------------------------- */

function daysOpen(createdAt: string) {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function formatTime(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

/* -- Metric Card ----------------------------------------------------- */

function Metric({ value, label, sublabel }: { value: string; label: string; sublabel?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-metric text-2xl text-foreground">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-foreground">{label}</p>
      {sublabel && <p className="text-[10px] text-muted-foreground">{sublabel}</p>}
    </div>
  );
}

/* -- Component ------------------------------------------------------- */

export default function TodayClient({ roles, triageItems, interviews, briefing, myActivity }: TodayClientProps) {
  useEntityEvent(["interview", "application", "role"]);

  const totalPipeline = roles.reduce(
    (sum, r) => sum + r.pipeline.sourced + r.pipeline.interview + r.pipeline.offer,
    0,
  );

  const today = new Date();
  const dayName = today.toLocaleDateString("en-US", { weekday: "long" });
  const dateStr = today.toLocaleDateString("en-US", { month: "long", day: "numeric" });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="space-y-10">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2 text-amber-600">
              <Sun className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">{dayName}, {dateStr}</span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
              Good morning. Here&apos;s what needs you today.
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {roles.length} open roles, {totalPipeline} candidates in pipeline, {interviews.length} interviews today.
            </p>
          </div>

          {/* Daily briefing */}
          {briefing && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
              <p className="text-sm leading-relaxed text-foreground">{briefing}</p>
            </div>
          )}

          {/* Quick metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric value={String(roles.length)} label="Open roles" />
            <Metric value={String(interviews.length)} label="Interviews today" />
            <Metric
              value={roles.length > 0 ? String(Math.round(roles.reduce((s, r) => s + daysOpen(r.createdAt), 0) / roles.length)) : "0"}
              label="Days avg time open"
            />
          </div>

          {/* Your activity today */}
          {(myActivity.candidatesScreened + myActivity.interviewsScheduled + myActivity.applicationsAdvanced + myActivity.offersMade) > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-foreground">Your activity today</h2>
              </div>
              <div className="flex flex-wrap gap-3">
                {myActivity.candidatesScreened > 0 && (
                  <div className="rounded-lg border border-border bg-card px-4 py-2.5">
                    <span className="text-sm font-semibold tabular-nums text-foreground">{myActivity.candidatesScreened}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">screened</span>
                  </div>
                )}
                {myActivity.interviewsScheduled > 0 && (
                  <div className="rounded-lg border border-border bg-card px-4 py-2.5">
                    <span className="text-sm font-semibold tabular-nums text-foreground">{myActivity.interviewsScheduled}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">interviews scheduled</span>
                  </div>
                )}
                {myActivity.applicationsAdvanced > 0 && (
                  <div className="rounded-lg border border-border bg-card px-4 py-2.5">
                    <span className="text-sm font-semibold tabular-nums text-foreground">{myActivity.applicationsAdvanced}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">advanced</span>
                  </div>
                )}
                {myActivity.offersMade > 0 && (
                  <div className="rounded-lg border border-border bg-card px-4 py-2.5">
                    <span className="text-sm font-semibold tabular-nums text-foreground">{myActivity.offersMade}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">offers made</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Today's interviews */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Interviews today</h2>
                <span className="text-xs text-muted-foreground">{interviews.length} scheduled</span>
              </div>
              <Link
                href="/recruit/interviews"
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                All interviews
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {interviews.length > 0 ? (
              <div className="space-y-3">
                {interviews.map((iv) => (
                  <Link
                    key={iv.id}
                    href={`/recruit/interviews/${iv.id}`}
                    className="block rounded-xl border border-border bg-card px-5 py-4 hover:border-primary/30 hover:bg-card/80 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-sm font-semibold tabular-nums text-foreground">{formatTime(iv.scheduledAt)}</p>
                          <p className="text-[10px] text-muted-foreground">{iv.durationMins || 45} min</p>
                        </div>
                        <div className="h-8 w-px bg-border" />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">{iv.candidateName || "TBD"}</p>
                            {iv.interviewType && (
                              <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                {iv.interviewType}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {iv.roleName || "Unknown role"} {iv.panelistNames.length > 0 ? `\u00B7 with ${iv.panelistNames.join(", ")}` : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                    {iv.evidenceTarget && (
                      <div className="mt-3 rounded-lg bg-secondary/80 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">
                          <span className="font-semibold text-foreground">Evidence target:</span> {iv.evidenceTarget}
                        </p>
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card/50 py-6 text-center">
                <p className="text-xs text-muted-foreground">No interviews scheduled for today.</p>
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}
