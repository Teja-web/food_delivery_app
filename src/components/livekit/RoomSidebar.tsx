"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { X, Play, Clock, CheckCircle2, Square, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { launchLiveAssessmentAction, updateLiveAssessment, listAssessments } from "@/actions/assessments";
import { ScorecardForm } from "@/components/shared/scorecard-form";
import type {
  RoomInfoTab,
  RoomGuideTab,
  RoomFeedbackTab,
  RoomAssessmentLauncher,
  RoomAssessmentData,
} from "@/app/(livekit)/interviews/[id]/room/serialize";
import type { AssessmentMirrorState } from "@/components/livekit/LiveAssessmentPanel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// -- Tab types ------------------------------------------------------

type SidebarTab = "brief" | "feedback" | "assessment";

const TABS: { key: SidebarTab; label: string }[] = [
  { key: "brief", label: "Brief" },
  { key: "feedback", label: "Feedback" },
  { key: "assessment", label: "Assessment" },
];

// -- Main sidebar ---------------------------------------------------

export function RoomSidebar({
  info,
  guide,
  feedback,
  assessment,
  interviewId,
  mirrorState,
  activeAssessment,
  onAssessmentChange,
  onClose,
}: {
  info: RoomInfoTab;
  guide: RoomGuideTab;
  feedback: RoomFeedbackTab;
  assessment: RoomAssessmentLauncher;
  interviewId: string;
  mirrorState: AssessmentMirrorState | null;
  activeAssessment: RoomAssessmentData | null;
  onAssessmentChange?: () => void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("brief");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-neutral-200">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex gap-1">
            {TABS.map((tab) => (
              <Button
                key={tab.key}
                variant="unstyled"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  activeTab === tab.key
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100",
                )}
              >
                {tab.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <RoomCountdown scheduledAt={info.scheduledAt} durationMins={info.durationMins} />
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onClose}
              className="rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "brief" && <BriefTabContent info={info} guide={guide} />}
        {activeTab === "feedback" && <FeedbackTabContent feedback={feedback} />}
        {activeTab === "assessment" && (
          <AssessmentTabContent
            assessment={assessment}
            interviewId={interviewId}
            mirrorState={mirrorState}
            activeAssessment={activeAssessment}
            onAssessmentChange={onAssessmentChange}
          />
        )}
      </div>
    </div>
  );
}

// -- Brief tab (merged Info + Guide) --------------------------------

function BriefTabContent({ info, guide }: { info: RoomInfoTab; guide: RoomGuideTab }) {
  const prep = guide.prep;

  return (
    <div className="space-y-3">
      {/* Context header: candidate → role, compact */}
      {(info.candidateName || info.roleName) && (
        <div className="flex items-start gap-3 rounded-lg bg-white border border-neutral-200 px-3 py-2.5">
          {info.candidateName && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-neutral-900 truncate">{info.candidateName}</p>
              {info.candidateTitle && (
                <p className="text-xs text-neutral-600 truncate">{info.candidateTitle}</p>
              )}
            </div>
          )}
          {info.candidateName && info.roleName && (
            <span className="text-neutral-300 text-sm leading-5 shrink-0">/</span>
          )}
          {info.roleName && (
            <div className="min-w-0 flex-1 text-right">
              <p className="text-sm font-semibold text-neutral-900 truncate">{info.roleName}</p>
              {info.scheduledAt && (
                <p className="text-xs text-neutral-600">
                  {new Date(info.scheduledAt).toLocaleString("en-US", {
                    weekday: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {info.durationMins ? ` · ${info.durationMins}m` : ""}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Briefing */}
      {prep?.briefing && (
        <p className="text-sm leading-relaxed text-neutral-700 border-l-2 border-neutral-300 pl-2.5">
          {prep.briefing}
        </p>
      )}

      {/* Opening talking points */}
      {prep?.opening?.talkingPoints && prep.opening.talkingPoints.length > 0 && (
        <Section label="Opening">
          <ul className="space-y-1.5">
            {prep.opening.talkingPoints.map((point, i) => (
              <li key={i} className="text-sm text-neutral-700 pl-2.5 border-l-2 border-violet-300">
                {point}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Focus areas — pill layout for fast scanning */}
      {prep?.focusAreas && prep.focusAreas.length > 0 && (
        <Section label="Focus">
          <div className="flex flex-wrap gap-1.5">
            {prep.focusAreas.map((area, i) => (
              <span
                key={i}
                className="inline-block rounded-md bg-neutral-100 border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-800"
              >
                {area}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Risk flags — amber accent, compact */}
      {prep?.riskFlags && prep.riskFlags.length > 0 && (
        <Section label="Risks">
          <div className="space-y-1.5">
            {prep.riskFlags.map((rf, i) => (
              <div key={i} className="rounded-md bg-amber-50/80 border border-amber-200/60 px-2.5 py-2">
                <p className="text-sm font-semibold text-amber-900">{rf.flag}</p>
                <p className="text-xs text-amber-800 mt-0.5">{rf.context}</p>
                <p className="text-xs text-amber-700 italic mt-0.5">Ask: {rf.suggestedProbe}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Questions — numbered, must-ask highlighted */}
      {prep?.questions && prep.questions.length > 0 && (
        <Section label="Questions">
          <div className="space-y-2">
            {prep.questions.map((q, i) => (
              <div key={i} className={cn(
                "rounded-md border px-2.5 py-2",
                q.priority === "must-ask"
                  ? "border-violet-200 bg-violet-50/40"
                  : "border-neutral-200 bg-white",
              )}>
                <div className="flex items-start gap-2">
                  <span className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    q.priority === "must-ask"
                      ? "bg-violet-200 text-violet-800"
                      : "bg-neutral-200 text-neutral-600",
                  )}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-900">{q.question}</p>
                    <p className="text-xs text-neutral-600 mt-0.5">{q.purpose}</p>
                    {q.followUps.length > 0 && (
                      <div className="pl-2 border-l border-neutral-200 space-y-0.5 mt-1.5">
                        {q.followUps.map((fu, j) => (
                          <p key={j} className="text-xs text-neutral-500">{fu}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Empty state */}
      {!prep && !info.candidateName && !info.roleName && (
        <p className="text-sm text-neutral-500 italic">
          No interview prep available yet.
        </p>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      {children}
    </div>
  );
}

function RoomCountdown({
  scheduledAt,
  durationMins,
}: {
  scheduledAt: string | null;
  durationMins: number | null;
}) {
  const [remaining, setRemaining] = useState<string>("");
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    if (!scheduledAt || !durationMins) return;

    const endTime = new Date(scheduledAt).getTime() + durationMins * 60_000;

    const tick = () => {
      const diff = endTime - Date.now();
      if (diff <= 0) {
        setRemaining("Time's up");
        setUrgent(true);
        return;
      }
      const mins = Math.floor(diff / 60_000);
      const secs = Math.floor((diff % 60_000) / 1000);
      setRemaining(`${mins}:${secs.toString().padStart(2, "0")}`);
      setUrgent(mins < 5);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [scheduledAt, durationMins]);

  if (!remaining) return null;

  return (
    <div className={cn(
      "rounded-md px-2 py-1 font-mono text-xs font-semibold tabular-nums transition-colors",
      urgent ? "bg-red-50 text-red-600 border border-red-200" : "bg-neutral-100 text-neutral-700",
    )}>
      {remaining}
    </div>
  );
}

// -- Feedback tab --------------------------------------------------

function FeedbackTabContent({ feedback }: { feedback: RoomFeedbackTab }) {
  return (
    <ScorecardForm
      interviewId={feedback.interviewId}
      competencies={feedback.competencies}
      existingRatings={feedback.existingRatings}
      autoSave
      variant="sidebar"
    />
  );
}

// -- Assessment tab ------------------------------------------------

function AssessmentTabContent({
  assessment,
  interviewId,
  mirrorState,
  activeAssessment,
  onAssessmentChange,
}: {
  assessment: RoomAssessmentLauncher;
  interviewId: string;
  mirrorState: AssessmentMirrorState | null;
  activeAssessment: RoomAssessmentData | null;
  onAssessmentChange?: () => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [timeLimit, setTimeLimit] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [availableAssessments, setAvailableAssessments] = useState(assessment.availableAssessments);
  const [refreshing, setRefreshing] = useState(false);
  const handleRefreshAssessments = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await listAssessments({ limit: 100, sortBy: "title", sortOrder: "asc" });
      setAvailableAssessments(
        res.items.map((a: any) => ({
          id: a.id,
          title: a.title,
          type: a.type,
          questionCount: a.questions?.length ?? 0,
        })),
      );
    } catch {}
    setRefreshing(false);
  }, []);

  const hasActive = !!activeAssessment;
  const isInProgress = hasActive && activeAssessment.status !== "submitted" && activeAssessment.status !== "cancelled";
  const [ending, setEnding] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handleEnd = useCallback(async () => {
    if (!activeAssessment) return;
    setEnding(true);
    try {
      await updateLiveAssessment(activeAssessment.attemptId, { status: "submitted" });
      onAssessmentChange?.();
    } catch {
      // Silently fail — will be picked up by SSE refresh
    } finally {
      setEnding(false);
    }
  }, [activeAssessment, onAssessmentChange]);

  const handleCancel = useCallback(async () => {
    if (!activeAssessment) return;
    setCancelling(true);
    try {
      await updateLiveAssessment(activeAssessment.attemptId, { status: "cancelled" });
      onAssessmentChange?.();
    } catch {
      // Silently fail — will be picked up by SSE refresh
    } finally {
      setCancelling(false);
    }
  }, [activeAssessment, onAssessmentChange]);

  const handleLaunch = () => {
    if (!selectedId) return;
    setError(null);
    startTransition(async () => {
      try {
        await launchLiveAssessmentAction(
          interviewId,
          selectedId,
          timeLimit ? parseInt(timeLimit, 10) : undefined,
        );
        onAssessmentChange?.();
        setSelectedId("");
        setTimeLimit("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to launch assessment");
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Active assessment progress */}
      {hasActive && (
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            Active Assessment
          </p>
          <div className="rounded-lg border border-neutral-200 bg-white p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-neutral-900">{activeAssessment.title}</p>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium",
                  activeAssessment.status === "submitted"
                    ? "bg-emerald-50 text-emerald-700"
                    : activeAssessment.status === "cancelled"
                      ? "bg-neutral-100 text-neutral-500"
                      : "bg-blue-50 text-blue-700",
                )}
              >
                {activeAssessment.status === "submitted" ? (
                  <><CheckCircle2 className="h-3 w-3" /> Submitted</>
                ) : activeAssessment.status === "cancelled" ? (
                  <><X className="h-3 w-3" /> Cancelled</>
                ) : (
                  "In Progress"
                )}
              </span>
            </div>

            {/* Progress from mirror state or from server data */}
            {(() => {
              const answeredCount = mirrorState
                ? Object.keys(mirrorState.answers).filter((k) => mirrorState.answers[k]?.trim()).length
                : Object.values(activeAssessment.existingAnswers ?? {}).filter(
                    (v) => typeof v === "string" && v.trim(),
                  ).length;
              const totalQuestions = activeAssessment.questions.length;
              const pct = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

              return (
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-neutral-500">
                    <span>{answeredCount} of {totalQuestions} answered</span>
                    {mirrorState && (
                      <span>Q{(mirrorState.questionIndex ?? 0) + 1}</span>
                    )}
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })()}

            <div className="flex items-center justify-between">
              {activeAssessment.deadlineAt && (
                <div className="flex items-center gap-1 text-[10px] text-neutral-500">
                  <Clock className="h-3 w-3" />
                  Deadline: {new Date(activeAssessment.deadlineAt).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
              )}

              {/* End / Cancel — only while in progress */}
              {isInProgress && (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="unstyled"
                    onClick={handleEnd}
                    disabled={ending || cancelling}
                    className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                  >
                    <Square className="h-2.5 w-2.5" />
                    {ending ? "Ending..." : "End"}
                  </Button>
                  <Button
                    variant="unstyled"
                    onClick={handleCancel}
                    disabled={ending || cancelling}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
                  >
                    <X className="h-2.5 w-2.5" />
                    {cancelling ? "Cancelling..." : "Cancel"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Launcher */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            {hasActive ? "Launch Another" : "Launch Assessment"}
          </p>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleRefreshAssessments}
            disabled={refreshing}
            className="rounded text-neutral-400 hover:text-neutral-600 disabled:opacity-50 transition-colors"
            title="Refresh assessment list"
          >
            <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
          </Button>
        </div>

        {availableAssessments.length === 0 ? (
          <p className="text-xs text-neutral-400 italic">
            No active assessments available. Create assessments in the Assessments section.
          </p>
        ) : (
          <>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-300 h-auto">
                <SelectValue placeholder="Select assessment..." />
              </SelectTrigger>
              <SelectContent>
                {availableAssessments.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.title} ({a.questionCount} questions)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Time limit (min)"
                value={timeLimit}
                onChange={(e) => setTimeLimit(e.target.value)}
                min={1}
                max={180}
                className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-300"
              />
              <span className="text-[10px] text-neutral-400">optional</span>
            </div>

            <Button
              variant="unstyled"
              onClick={handleLaunch}
              disabled={!selectedId || isPending}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-neutral-900 py-2.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? (
                "Launching..."
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  Launch Assessment
                </>
              )}
            </Button>

            {error && (
              <p className="text-xs text-red-600">{error}</p>
            )}
          </>
        )}
      </div>

    </div>
  );
}
