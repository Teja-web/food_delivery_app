"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Brain,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  MapPin,
  Sparkles,
  Target,
  Video,
} from "lucide-react";
import type { serializeInterviews, SerializedInterview } from "@/app/(portal)/(protected)/interviews/serialize";
import { Button } from "@/components/ui/button";

type GroupedInterviews = ReturnType<typeof serializeInterviews>;

export function RoleInterviewsClient({
  interviews,
  roleId,
}: {
  interviews: GroupedInterviews;
  roleId: string;
}) {
  const { live, upcoming, pending, past } = interviews;
  const hasAny = live.length + upcoming.length + pending.length + past.length > 0;

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-12 text-center">
        <Video className="h-8 w-8 text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium text-foreground">No interviews yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            When interviews are scheduled for this role, they will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {live.length > 0 && (
        <Section title="Live now" count={live.length} variant="live">
          {live.map((iv) => (
            <InterviewCard key={iv.id} interview={iv} roleId={roleId} />
          ))}
        </Section>
      )}
      {upcoming.length > 0 && (
        <Section title="Upcoming" count={upcoming.length}>
          {upcoming.map((iv) => (
            <InterviewCard key={iv.id} interview={iv} roleId={roleId} />
          ))}
        </Section>
      )}
      {pending.length > 0 && (
        <Section title="Pending scheduling" count={pending.length}>
          {pending.map((iv) => (
            <InterviewCard key={iv.id} interview={iv} roleId={roleId} />
          ))}
        </Section>
      )}
      {past.length > 0 && (
        <Section title="Past" count={past.length} collapsible>
          {past.map((iv) => (
            <InterviewCard key={iv.id} interview={iv} roleId={roleId} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  variant,
  collapsible,
  children,
}: {
  title: string;
  count: number;
  variant?: "live";
  collapsible?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!collapsible);

  return (
    <section>
      <Button
        type="button"
        variant="unstyled"
        onClick={() => collapsible && setOpen(!open)}
        className={`mb-3 flex items-center gap-2 ${collapsible ? "cursor-pointer" : "cursor-default"}`}
      >
        {variant === "live" && (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        )}
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {count}
        </span>
        {collapsible && (
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </Button>
      {open && <div className="space-y-3">{children}</div>}
    </section>
  );
}

function InterviewCard({
  interview: iv,
  roleId,
}: {
  interview: SerializedInterview;
  roleId: string;
}) {
  const isLive = iv.isJoinable;
  const isCompleted = iv.status === "completed";
  const isPending = iv.status === "proposed";
  const [evalOpen, setEvalOpen] = useState(false);

  return (
    <div
      className={`rounded-xl border bg-card p-4 transition-all ${
        isLive ? "border-emerald-200 shadow-sm shadow-emerald-100/50" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              isLive
                ? "bg-emerald-100"
                : isCompleted
                  ? "bg-secondary"
                  : isPending
                    ? "bg-amber-50"
                    : "bg-secondary"
            }`}
          >
            <Video
              className={`h-5 w-5 ${
                isLive
                  ? "text-emerald-600"
                  : isCompleted
                    ? "text-muted-foreground"
                    : isPending
                      ? "text-amber-500"
                      : "text-muted-foreground"
              }`}
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{iv.jobTitle}</p>
            {iv.scheduledAt && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {new Date(iv.scheduledAt).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            )}
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              {iv.durationMins && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {iv.durationMins} min
                </span>
              )}
              {iv.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {iv.location}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isLive && (iv.meetingLink || iv.roomUrl) && (
            <Link
              href={iv.meetingLink || iv.roomUrl!}
              target={iv.meetingLink ? "_blank" : undefined}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
            >
              <Video className="h-3.5 w-3.5" />
              Join now
            </Link>
          )}
          {!isLive && iv.status === "confirmed" && iv.scheduledAt && new Date(iv.scheduledAt) > new Date() && (
            <Link
              href={`/prepare?role=${roleId}&interview=${iv.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
            >
              <Brain className="h-3 w-3" />
              Prep
            </Link>
          )}
          {isPending && (
            <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-medium text-amber-700">
              Awaiting scheduling
            </span>
          )}
          {iv.status === "cancelled" && (
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Cancelled
            </span>
          )}
          {iv.status === "declined" && (
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Declined
            </span>
          )}
        </div>
      </div>

      {isCompleted && iv.evaluationSummary && (
        <div className="mt-3 border-t border-border pt-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setEvalOpen(!evalOpen)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Sparkles className="h-3 w-3 text-amber-500" />
            Interview feedback
            <ChevronRight
              className={`h-3 w-3 transition-transform ${evalOpen ? "rotate-90" : ""}`}
            />
          </Button>

          {evalOpen && (
            <div className="mt-3 space-y-3 feed-item-enter">
              {iv.evaluationSummary.assessmentParagraph && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {iv.evaluationSummary.assessmentParagraph}
                </p>
              )}

              {iv.evaluationSummary.competencyScores.length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-foreground">
                    <Target className="h-3 w-3" />
                    Competency scores
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {iv.evaluationSummary.competencyScores.map((cs) => {
                      const pct = Math.round((cs.score / 10) * 100);
                      return (
                        <div key={cs.competency} className="flex items-center gap-2">
                          <span className="w-24 truncate text-[11px] text-muted-foreground">
                            {cs.competency}
                          </span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                            <div
                              className={`h-full rounded-full ${
                                pct >= 70 ? "bg-emerald-400" : pct >= 40 ? "bg-amber-400" : "bg-red-400"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-6 text-right text-[10px] font-bold text-foreground">
                            {cs.score}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {iv.evaluationSummary.standoutMoments.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-foreground">
                    Standout moments
                  </p>
                  <ul className="space-y-1">
                    {iv.evaluationSummary.standoutMoments.map((m, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {iv.evaluationSummary.keyInsights.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-foreground">
                    Key insights
                  </p>
                  <ul className="space-y-1">
                    {iv.evaluationSummary.keyInsights.map((ins, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-stone-300" />
                        {ins}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
