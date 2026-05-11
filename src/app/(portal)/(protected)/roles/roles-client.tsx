"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useEntityEvent } from "@/hooks/use-entity-event";
import Link from "next/link";
import {
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Compass,
  Dumbbell,
  Loader2,
  MapPin,
  MessageCircle,
  MessageSquare,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import {
  expressInterestInRole,
  dismissPortalMatchAction,
} from "@/actions/portal";
import { confirmInterviewSlot, declineInterview } from "@/actions/interviews";
import { useRoomTimeStatus } from "@/components/shared/join-room-button";
import { MatchCard } from "@/components/shared/match-card";
import type { PortalApplication, PortalApplicationInterview } from "./serialize";
import { Button } from "@/components/ui/button";

/* -- Discover Types ------------------------------------------- */

interface Role {
  jobId: string;
  title: string;
  department: string | null;
  description: string | null;
  location: string | null;
  employmentType: string | null;
  comp: Record<string, unknown> | null;
  profile: Record<string, unknown> | null;
  orgName: string | null;
  score: number;
  signal: string | null;
  hasApplication: boolean;
  hasInterest: boolean;
}

interface PendingInterview {
  id: string;
  jobTitle: string;
  durationMins: number;
  location: string | null;
  proposedSlots: Array<{ startAt: string; endAt: string }>;
  candidateToken: string;
}

/* -- Completed Interview Types ------------------------------- */

interface CompletedInterview {
  id: string;
  jobId: string;
  jobTitle: string;
  scheduledAt: string;
  status: string;
  executiveSummary: string | null;
  competencies: Array<{ competency: string; score: number; signals: string[] }>;
  standoutMoments: string[];
  keyInsights: string[];
  transcriptCompetencyScores: Array<{ competency: string; score: number; evidence: string }>;
  interviewQuality: { score: number; reasoning: string } | null;
  avgRating: number | null;
  recommendation: string | null;
}

interface PastApplication {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  jobLocation: string | null;
  orgName: string | null;
  stage: string;
  offerStatus: string | null;
  updatedAt: string | null;
}

/* -- Component ------------------------------------------------ */

export function RolesClient({
  roles: initialRoles,
  hasProfile,
  applications,
  pastApplications,
  pendingInterviews: initialPendingInterviews,
  completedInterviews,
}: {
  roles: Role[];
  hasProfile: boolean;
  applications: PortalApplication[];
  pastApplications: PastApplication[];
  pendingInterviews: PendingInterview[];
  completedInterviews: CompletedInterview[];
}) {
  const router = useRouter();
  const [roles, setRoles] = useState(initialRoles);
  const [interestedIds, setInterestedIds] = useState<Set<string>>(
    new Set(initialRoles.filter((r) => r.hasInterest).map((r) => r.jobId))
  );
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  // Interview acceptance state
  const [pendingInterviews, setPendingInterviews] = useState(initialPendingInterviews);
  const [selectedSlots, setSelectedSlots] = useState<Record<string, number>>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const visibleRoles = roles.filter((r) => !dismissedIds.has(r.jobId) && !r.hasApplication);

  // Refresh when candidate profile is updated (e.g., resume upload)
  useEntityEvent("candidate");

  function handleInterest(jobId: string) {
    startTransition(async () => {
      await expressInterestInRole(jobId);
      setInterestedIds((prev) => new Set([...prev, jobId]));
    });
  }

  function handleDismiss(jobId: string, title: string) {
    startTransition(async () => {
      await dismissPortalMatchAction(jobId, title);
      setDismissedIds((prev) => new Set([...prev, jobId]));
    });
  }

  function handleSelectSlot(interviewId: string, slotIndex: number) {
    setSelectedSlots((prev) => ({ ...prev, [interviewId]: slotIndex }));
    setConfirmError(null);
  }

  function handleConfirmInterview(interview: PendingInterview) {
    const slotIndex = selectedSlots[interview.id];
    if (slotIndex === undefined) return;
    const selectedSlot = interview.proposedSlots[slotIndex];
    if (!selectedSlot) return;

    setConfirmingId(interview.id);
    setConfirmError(null);

    startTransition(async () => {
      const result = await confirmInterviewSlot(interview.candidateToken, selectedSlot);
      if (result.success) {
        setPendingInterviews((prev) => prev.filter((iv) => iv.id !== interview.id));
        router.push(`/roles`);
      } else {
        setConfirmError(result.error ?? "Failed to confirm interview");
      }
      setConfirmingId(null);
    });
  }

  function handleDeclineInterview(interview: PendingInterview) {
    setDecliningId(interview.id);
    setConfirmError(null);

    startTransition(async () => {
      const result = await declineInterview(interview.candidateToken);
      if (result.success) {
        setPendingInterviews((prev) => prev.filter((iv) => iv.id !== interview.id));
        router.refresh();
      } else {
        setConfirmError(result.error ?? "Failed to decline interview");
      }
      setDecliningId(null);
    });
  }

  function formatSlotDate(isoString: string) {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  function formatSlotTime(startAt: string, endAt: string) {
    const start = new Date(startAt);
    const end = new Date(endAt);
    return `${start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })} – ${end.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="space-y-8">
          {/* Header */}
          <div className="section-reveal">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Compass className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Roles</span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
              Your roles
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Matched roles, active applications, and upcoming interviews in one place.
            </p>
          </div>

          {/* -- Pending Interviews (need to accept) --------------- */}
          {pendingInterviews.length > 0 && (
            <div className="section-reveal space-y-3">
              {pendingInterviews.map((interview) => (
                <div
                  key={interview.id}
                  className="rounded-xl border border-blue-200 bg-blue-50/50 p-4"
                >
                  {/* Header row: info left, meta right */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                        <Calendar className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Interview scheduled for {interview.jobTitle}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Please select a time that works for you
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {interview.durationMins && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {interview.durationMins} min
                        </span>
                      )}
                      {interview.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {interview.location}
                        </span>
                      )}
                    </div>
                  </div>

                  {interview.proposedSlots.length > 0 && (
                    <div className="mt-3">
                      {/* Slots in a horizontal row */}
                      <div className="flex flex-wrap gap-2">
                        {interview.proposedSlots.map((slot, idx) => (
                          <Button
                            key={idx}
                            variant="unstyled"
                            onClick={() => handleSelectSlot(interview.id, idx)}
                            className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all ${
                              selectedSlots[interview.id] === idx
                                ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                                : "border-border bg-card hover:border-blue-300"
                            }`}
                          >
                            <div
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                                selectedSlots[interview.id] === idx
                                  ? "border-blue-500 bg-blue-500"
                                  : "border-muted-foreground/30"
                              }`}
                            >
                              {selectedSlots[interview.id] === idx && (
                                <Check className="h-2.5 w-2.5 text-white" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {formatSlotDate(slot.startAt)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatSlotTime(slot.startAt, slot.endAt)}
                              </p>
                            </div>
                          </Button>
                        ))}
                      </div>

                      {/* Actions row */}
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          variant="unstyled"
                          onClick={() => handleConfirmInterview(interview)}
                          disabled={selectedSlots[interview.id] === undefined || confirmingId === interview.id || decliningId === interview.id}
                          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {confirmingId === interview.id ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Confirming...
                            </>
                          ) : (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              Confirm Interview
                            </>
                          )}
                        </Button>
                        <Button
                          variant="unstyled"
                          onClick={() => handleDeclineInterview(interview)}
                          disabled={confirmingId === interview.id || decliningId === interview.id}
                          className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-stone-600 transition-colors hover:bg-stone-50 hover:text-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {decliningId === interview.id ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Declining...
                            </>
                          ) : (
                            <>
                              <X className="h-3.5 w-3.5" />
                              Decline
                            </>
                          )}
                        </Button>
                      </div>

                      {confirmError && confirmingId === null && decliningId === null && (
                        <p className="mt-2 text-xs text-red-600">{confirmError}</p>
                      )}
                    </div>
                  )}

                  {interview.proposedSlots.length === 0 && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      No time slots have been proposed yet. The recruiter will send available times soon.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* -- Discover Strip ---------------------------------- */}
          <section className="section-reveal" style={{ animationDelay: "80ms" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Matched for you
                </h2>
              </div>
              {visibleRoles.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {visibleRoles.length} roles
                </span>
              )}
            </div>

            {!hasProfile ? (
              <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/30 p-5">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Complete your profile to get matched
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Upload your resume and the coach will find roles that fit your background.
                  </p>
                  <Link
                    href="/coach"
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    <MessageCircle className="h-3 w-3" />
                    Talk to Coach
                  </Link>
                </div>
              </div>
            ) : visibleRoles.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-8 text-center">
                <p className="text-sm font-semibold text-foreground">
                  No matching roles right now
                </p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Check back soon — new roles are matched as they open.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleRoles.map((role) => {
                  const isInterested = interestedIds.has(role.jobId);
                  const hasApp = role.hasApplication && !role.hasInterest;
                  const showActions = !hasApp && !isInterested;
                  return (
                    <MatchCard
                      key={role.jobId}
                      href={`/roles/${role.jobId}`}
                      title={role.title}
                      subtitle={[role.orgName, role.department, role.location].filter(Boolean).join(" · ") || undefined}
                      fitScore={role.score}
                      recommendation={null}
                      alignment={[]}
                      signal={role.signal}
                      gaps={[]}
                      summary={role.description}
                      isPending={isPending}
                    >
                      {showActions && (
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="soft" size="sm" className="text-[11px]" disabled={isPending} onClick={() => handleDismiss(role.jobId, role.title)}>
                            Not for me
                          </Button>
                          <Button size="sm" className="text-[11px]" disabled={isPending} onClick={() => handleInterest(role.jobId)}>
                            Interested
                          </Button>
                        </div>
                      )}
                    </MatchCard>
                  );
                })}
              </div>
            )}
          </section>

          {/* -- Active Applications ----------------------------- */}
          <section className="section-reveal" style={{ animationDelay: "160ms" }}>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active Applications
            </h2>

            {applications.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 py-10 text-center">
                <Building2 className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm font-semibold text-foreground">No applications yet</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Express interest in roles above, or let your coach find matches.
                </p>
                <div className="flex gap-2">
                  <Link
                    href="/coach"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors"
                  >
                    <MessageCircle className="h-3 w-3" />
                    Talk to Coach
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {applications.map((app, idx) => (
                  <div
                    key={app.id}
                    className="feed-item-enter"
                    style={{ animationDelay: `${idx * 60}ms` }}
                  >
                    <MatchCard
                      href={`/roles/${app.jobId}`}
                      title={app.jobTitle}
                      subtitle={[app.orgName, app.jobLocation || "Remote"].filter(Boolean).join(" · ")}
                      fitScore={app.fitScore}
                      recommendation={app.recommendation}
                      alignment={app.alignment}
                      signal={app.signal}
                      gaps={app.gaps}
                      summary={app.summary}
                      stage={app.stage}
                      isPending={false}
                    >
                      {app.interview ? (
                        <ApplicationInterviewAction interview={app.interview} jobId={app.jobId} />
                      ) : (
                        <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2.5">
                          <Dumbbell className="h-4 w-4 shrink-0 text-violet-600" />
                          <div className="flex-1">
                            <p className="text-xs font-medium text-foreground">Prep Studio</p>
                            <p className="text-[11px] text-muted-foreground">Practice questions & mock interviews</p>
                          </div>
                          <Link
                            href={`/prepare?role=${app.jobId}`}
                            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-700 transition-colors"
                          >
                            Start Prep
                          </Link>
                        </div>
                      )}
                    </MatchCard>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* -- Completed Interviews ----------------------------- */}
          {completedInterviews.length > 0 && (
            <section className="section-reveal" style={{ animationDelay: "240ms" }}>
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Interview Feedback
              </h2>
              <div className="space-y-3">
                {completedInterviews.map((iv) => (
                  <CompletedInterviewCard key={iv.id} interview={iv} />
                ))}
              </div>
            </section>
          )}

          {/* -- Past Applications ---------------------------------- */}
          {pastApplications.length > 0 && (
            <section className="section-reveal" style={{ animationDelay: "280ms" }}>
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Past Applications
              </h2>
              <div className="space-y-2">
                {pastApplications.map((app) => (
                  <PastApplicationCard key={app.applicationId} application={app} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/* -- Application Interview Action ------------------------------ */

function ApplicationInterviewAction({ interview, jobId }: { interview: PortalApplicationInterview; jobId: string }) {
  const { status } = useRoomTimeStatus(interview.scheduledAt, interview.durationMins);

  // Don't show interview action for completed interviews - they appear in "Interview Feedback" section
  const COMPLETED_STATUSES = ["completed", "evaluated"];
  if (COMPLETED_STATUSES.includes(interview.status)) return null;

  if (status === "open" && (interview.meetingLink || interview.candidateToken)) {
    const joinUrl = interview.meetingLink || `/interviews/${interview.interviewId}/room?token=${interview.candidateToken}`;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2.5">
        <svg className="h-4 w-4 shrink-0 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
        <p className="flex-1 text-xs font-medium text-blue-900">Your interview room is open</p>
        <Link
          href={joinUrl}
          target={interview.meetingLink ? "_blank" : undefined}
          className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Join now
        </Link>
      </div>
    );
  }

  if (status === "after" || !interview.scheduledAt) return null;

  const scheduled = new Date(interview.scheduledAt);
  const diff = scheduled.getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  const when = days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  const dateStr = scheduled.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5">
      <Calendar className="h-4 w-4 shrink-0 text-amber-600" />
      <div className="flex-1">
        <p className="text-xs font-medium text-foreground">Interview {when}</p>
        <p className="text-[11px] text-muted-foreground">{dateStr}</p>
      </div>
      <Link
        href={`/prepare?role=${jobId}&interview=${interview.interviewId}`}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-stone-800 transition-colors"
      >
        <Dumbbell className="h-3 w-3" />
        Prep
      </Link>
    </div>
  );
}

/* -- Completed Interview Card ---------------------------------- */

function ScorePill({ label, score }: { label: string; score: number }) {
  const color = score >= 80 ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : score >= 60 ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-muted-foreground bg-secondary border-border";
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 ${color}`}>
      <span className="text-[10px] uppercase tracking-wider opacity-70">{label}</span>
      <p className="text-sm font-semibold tabular-nums">{score}</p>
    </div>
  );
}

function CompletedInterviewCard({ interview: iv }: { interview: CompletedInterview }) {
  const [expanded, setExpanded] = useState(false);
  const date = new Date(iv.scheduledAt);
  const hasFeedback = iv.executiveSummary || iv.competencies.length > 0 || iv.keyInsights.length > 0;
  const hasTranscriptScores = iv.transcriptCompetencyScores.length > 0;

  return (
    <div className="feed-item-enter rounded-xl border border-border bg-card overflow-hidden">
      <Button
        variant="unstyled"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{iv.jobTitle}</p>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize bg-emerald-50 text-emerald-700 border border-emerald-200">
              {iv.status}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock size={10} className="shrink-0" />
              {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </span>
            {iv.avgRating != null && (
              <span className="flex items-center gap-1">
                <Star size={10} className="shrink-0" />
                {iv.avgRating.toFixed(1)} avg rating
              </span>
            )}
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </Button>

      {expanded && (
        <div className="space-y-4 border-t border-border px-5 py-5">
          {!hasFeedback && !hasTranscriptScores && (
            <p className="text-xs text-muted-foreground italic">Feedback analysis is still processing. Check back soon.</p>
          )}

          {iv.executiveSummary && (
            <div className="rounded-xl bg-secondary/80 px-4 py-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Summary</p>
              <p className="text-[13px] leading-relaxed text-foreground">{iv.executiveSummary}</p>
            </div>
          )}

          {hasTranscriptScores && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Deduced from Transcript</p>
              <div className="grid grid-cols-3 gap-2">
                {iv.transcriptCompetencyScores.map((cs) => (
                  <ScorePill key={cs.competency} label={cs.competency} score={cs.score} />
                ))}
              </div>
              <div className="space-y-1.5">
                {iv.transcriptCompetencyScores.filter((cs) => cs.evidence).map((cs) => (
                  <p key={cs.competency} className="text-[11px] text-muted-foreground"><span className="font-medium text-foreground">{cs.competency}:</span> {cs.evidence}</p>
                ))}
              </div>
            </div>
          )}

          {iv.competencies.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <MessageSquare className="inline h-3 w-3 mr-1" />
                Interviewer feedback
              </p>
              <div className="space-y-2">
                {iv.competencies.map((c) => (
                  <div key={c.competency} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-foreground w-28 shrink-0 truncate">{c.competency}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          c.score >= 80 ? "bg-emerald-500" : c.score >= 60 ? "bg-amber-500" : "bg-red-400"
                        }`}
                        style={{ width: `${c.score}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-semibold tabular-nums text-muted-foreground w-8 text-right">{c.score}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {iv.keyInsights.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Key insights</p>
              <ul className="space-y-1">
                {iv.keyInsights.map((insight, i) => (
                  <li key={i} className="text-xs text-muted-foreground leading-relaxed flex gap-2">
                    <span className="shrink-0 text-muted-foreground/40">-</span>
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {iv.standoutMoments.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Standout moments</p>
              <ul className="space-y-1">
                {iv.standoutMoments.map((m, i) => (
                  <li key={i} className="text-xs text-muted-foreground leading-relaxed flex gap-2">
                    <span className="shrink-0 text-amber-500">*</span>
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {iv.recommendation && (
            <div className="rounded-lg bg-secondary/60 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">Recommendation: </span>
                {iv.recommendation}
              </p>
            </div>
          )}

          {iv.interviewQuality && (
            <div className="flex items-start gap-3 text-[11px]">
              <span className="text-muted-foreground/60">Interview quality: <span className="font-semibold text-foreground">{iv.interviewQuality.score}/100</span></span>
              <span className="text-muted-foreground">{iv.interviewQuality.reasoning}</span>
            </div>
          )}

          {/* Prep CTA for weak areas */}
          {(() => {
            const weakCompetencies = iv.competencies.filter((c) => c.score < 60);
            if (weakCompetencies.length === 0) return null;
            return (
              <div className="flex items-center gap-3 rounded-lg border border-amber-100 bg-amber-50/30 px-3 py-2.5">
                <Dumbbell className="h-4 w-4 shrink-0 text-amber-600" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-foreground">
                    Practice: {weakCompetencies.map((c) => c.competency).join(", ")}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Target these areas in your next prep session</p>
                </div>
                <Link
                  href={`/prepare?role=${iv.jobId}`}
                  className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-amber-700 transition-colors"
                >
                  Prep now
                </Link>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

/* -- Past Application Card ------------------------------------- */

function PastApplicationCard({ application: app }: { application: PastApplication }) {
  const statusLabel = app.offerStatus === "declined"
    ? "Offer Declined"
    : app.stage === "withdrawn"
    ? "Withdrawn"
    : app.stage === "rejected"
    ? "Not Selected"
    : app.stage;

  const statusColor = app.offerStatus === "declined"
    ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-muted-foreground bg-secondary border-border";

  const updatedDate = app.updatedAt ? new Date(app.updatedAt) : null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card/50 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground truncate">{app.jobTitle}</p>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
          {app.orgName && (
            <span className="flex items-center gap-1">
              <Building2 size={10} className="shrink-0" />
              {app.orgName}
            </span>
          )}
          {app.jobLocation && (
            <span className="flex items-center gap-1">
              <MapPin size={10} className="shrink-0" />
              {app.jobLocation}
            </span>
          )}
          {updatedDate && (
            <span className="flex items-center gap-1">
              <Clock size={10} className="shrink-0" />
              {updatedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          )}
        </div>
      </div>
      {/* Show offer link for declined offers */}
      {app.offerStatus === "declined" && (
        <Link
          href={`/roles/${app.jobId}/offer`}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View offer
        </Link>
      )}
    </div>
  );
}
