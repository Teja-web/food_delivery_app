"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useEntityEvent } from "@/hooks/use-entity-event";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Calendar,
  Check,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Info,
  Link2,
  Loader2,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Star,
  Target,
  User,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Streamdown } from "streamdown";
import { saveTranscript } from "@/actions/interviews";
import { AskAIButton } from "@/components/shared/ask-ai-button";
import { EntityActivity } from "@/components/shared/entity-activity";
import type { InterviewDetailProps, SerializedScorecard } from "./serialize";
import type { InterviewPrep } from "@/db/schema/intelligence";
import { JoinRoomButton } from "@/components/shared/join-room-button";

/* -- Tab config -------------------------------------------------------- */

type Tab = "info" | "preparation" | "transcript" | "feedback" | "activity";

const TABS: { key: Tab; label: string; icon: typeof Info }[] = [
  { key: "info", label: "Info", icon: Info },
  { key: "preparation", label: "Preparation", icon: BookOpen },
  { key: "transcript", label: "Transcript", icon: FileText },
  { key: "feedback", label: "Feedback", icon: MessageSquare },
  { key: "activity", label: "Feed", icon: Clock },
];

/* -- Helpers -------------------------------------------------------- */

function formatDateTime(iso: string | null): string {
  if (!iso) return "Not scheduled";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatTypeIcon(type: string | null) {
  switch (type) {
    case "video_call":
      return <Video className="h-3.5 w-3.5 text-blue-500" />;
    case "in_person":
      return <MapPin className="h-3.5 w-3.5 text-amber-500" />;
    case "phone":
      return <Phone className="h-3.5 w-3.5 text-emerald-500" />;
    default:
      return <Calendar className="h-3.5 w-3.5 text-violet-500" />;
  }
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    scheduled: "text-blue-700 bg-blue-50 border-blue-200",
    completed: "text-emerald-700 bg-emerald-50 border-emerald-200",
    cancelled: "text-red-600 bg-red-50 border-red-200",
  };
  return (
    <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-semibold capitalize", styles[status] ?? "text-muted-foreground bg-secondary border-border")}>
      {status}
    </span>
  );
}

function verdictColor(verdict: string | null) {
  if (!verdict) return "text-muted-foreground bg-secondary border-border";
  if (verdict === "strong_yes" || verdict === "yes") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (verdict === "neutral") return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-red-600 bg-red-50 border-red-200";
}

/* -- Info Tab ------------------------------------------------------- */

function InfoTab({ interview }: { interview: InterviewDetailProps }) {
  return (
    <div className="space-y-4">
      {/* AI Analysis - Candidate Briefing */}
      {interview.prep?.briefing && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-violet-600" />
            <p className="text-xs font-bold uppercase tracking-widest text-violet-700">AI Analysis</p>
          </div>
          <p className="text-sm leading-relaxed text-foreground">{interview.prep.briefing}</p>
        </div>
      )}

      {/* Risk Flags from AI */}
      {interview.prep?.riskFlags && interview.prep.riskFlags.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Risk Areas to Probe</p>
          </div>
          <div className="space-y-2">
            {interview.prep.riskFlags.slice(0, 3).map((rf, idx) => (
              <div key={idx} className="rounded-lg border border-amber-200/60 bg-white/50 px-3 py-2">
                <p className="text-sm font-medium text-foreground">{rf.flag}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{rf.context}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interview Evaluation - shown when evidence has been processed */}
      {interview.evaluation && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Star className="h-3.5 w-3.5 text-emerald-600" />
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Interview Evaluation</p>
            {interview.evaluation.evidenceSources?.length > 0 && (
              <span className="text-[9px] text-emerald-600/60 ml-auto">{interview.evaluation.evidenceSources.join(" + ")}</span>
            )}
          </div>

          {/* Summary */}
          {interview.evaluation.assessmentParagraph && (
            <Streamdown className="prose prose-sm prose-neutral max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 text-foreground">
              {interview.evaluation.assessmentParagraph}
            </Streamdown>
          )}

          {/* Competency scores — two columns: reviewer feedback vs transcript deduced */}
          {(interview.evaluation.alignmentByCompetency?.length > 0 || interview.evaluation.transcriptCompetencyScores?.length > 0) && (
            <div className="grid grid-cols-2 gap-4">
              {/* Left column: Reviewer Feedback — from scorecards */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Reviewer Feedback</p>
                {interview.evaluation.alignmentByCompetency?.length > 0 ? (
                  interview.evaluation.alignmentByCompetency.map((a, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg border border-emerald-200/40 bg-white/50 px-3 py-2">
                      <span className={cn("text-sm font-bold tabular-nums w-10", a.score >= 75 ? "text-emerald-700" : a.score >= 50 ? "text-amber-700" : "text-red-600")}>{a.score}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-foreground">{a.competency}</p>
                          <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-medium", a.panelAgreement === "unanimous" ? "bg-emerald-100 text-emerald-700" : a.panelAgreement === "majority" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600")}>{a.panelAgreement}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{a.evidence}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-muted-foreground italic py-2">No scorecards submitted yet</p>
                )}
              </div>

              {/* Right column: Deduced from Transcript */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Deduced from Transcript</p>
                {interview.evaluation.transcriptCompetencyScores?.length > 0 ? (
                  interview.evaluation.transcriptCompetencyScores.map((cs, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg border border-zinc-200/60 bg-white/50 px-3 py-2">
                      <span className={cn("text-sm font-bold tabular-nums w-10", cs.score >= 7 ? "text-emerald-700" : cs.score >= 4 ? "text-amber-700" : "text-red-600")}>{cs.score}<span className="text-[10px] font-normal text-muted-foreground">/10</span></span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground">{cs.competency}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{cs.evidence}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-muted-foreground italic py-2">No transcript available</p>
                )}
              </div>
            </div>
          )}

          {/* Meta row: panel health, evidence coverage, consensus */}
          {(interview.evaluation.panelHealth || interview.evaluation.evidenceCoverage != null || interview.evaluation.consensus) && (
          <div className="rounded-lg border border-zinc-200/80 bg-zinc-50/50 px-4 py-3 space-y-2.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Evaluation Quality</p>
            <div className="flex items-start gap-4">
              {interview.evaluation.panelHealth && (() => {
                const cfg = { complete: { color: "text-emerald-600", bg: "bg-emerald-500", label: "Complete" }, partial: { color: "text-amber-600", bg: "bg-amber-500", label: "Partial" }, insufficient: { color: "text-red-500", bg: "bg-red-500", label: "Insufficient" } }[interview.evaluation.panelHealth];
                return (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn("h-2 w-2 rounded-full", cfg.bg)} />
                    <div>
                      <p className="text-[10px] text-zinc-400 leading-none">Panel</p>
                      <p className={cn("text-xs font-semibold leading-snug", cfg.color)}>{cfg.label}</p>
                    </div>
                  </div>
                );
              })()}
              {interview.evaluation.evidenceCoverage != null && (() => {
                const pct = Math.round(interview.evaluation.evidenceCoverage * 100);
                const color = pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-red-500";
                const trackColor = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
                return (
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="h-7 w-7 relative">
                      <svg viewBox="0 0 36 36" className="h-7 w-7 -rotate-90">
                        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-zinc-200" />
                        <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3" strokeDasharray={`${pct * 0.9425} 94.25`} strokeLinecap="round" className={trackColor.replace("bg-", "text-")} stroke="currentColor" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-400 leading-none">Evidence</p>
                      <p className={cn("text-xs font-semibold leading-snug tabular-nums", color)}>{pct}%</p>
                    </div>
                  </div>
                );
              })()}
              {interview.evaluation.consensus && (
                <div className="flex-1 min-w-0 border-l border-zinc-200/80 pl-4">
                  <p className="text-[10px] text-zinc-400 leading-none mb-0.5">Consensus</p>
                  <Streamdown className="prose prose-xs prose-neutral max-w-none prose-p:my-0 text-[11px] leading-relaxed text-zinc-600">{interview.evaluation.consensus}</Streamdown>
                </div>
              )}
            </div>
          </div>
          )}

          {/* Topics discussed */}
          {interview.evaluation.topicsDiscussed?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {interview.evaluation.topicsDiscussed.map((topic, i) => (
                <span key={i} className="rounded-full border border-emerald-200/60 bg-white/50 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">{topic}</span>
              ))}
            </div>
          )}

          {/* Standout moments */}
          {interview.evaluation.standoutMoments?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 mb-1.5 flex items-center gap-1.5">
                <Star className="h-3 w-3" />
                Standout Moments
              </p>
              <ul className="space-y-1">
                {interview.evaluation.standoutMoments.map((m, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-foreground">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Red flags */}
          {interview.evaluation.redFlags?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-600 mb-1.5 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" />
                Concerns
              </p>
              <ul className="space-y-1">
                {interview.evaluation.redFlags.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-foreground">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-500" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Assessment results from linked assessments */}
          {interview.evaluation.assessmentResults?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Linked Assessments</p>
              <div className="space-y-1.5">
                {interview.evaluation.assessmentResults.map((a, i) => (
                  <div key={i} className="rounded-lg border border-border/60 bg-white/50 px-3 py-2 space-y-1.5">
                    <div className="flex items-center gap-3">
                      <span className={cn("text-sm font-bold tabular-nums", a.score >= a.maxScore * 0.75 ? "text-emerald-700" : a.score >= a.maxScore * 0.5 ? "text-amber-700" : "text-red-600")}>{a.score}<span className="text-xs font-normal text-muted-foreground">/{a.maxScore}</span></span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground">{a.assessmentName}</p>
                        <p className="text-[10px] text-muted-foreground">{a.type}</p>
                      </div>
                    </div>
                    {a.keyFindings?.length > 0 && (
                      <ul className="ml-[52px] space-y-0.5">
                        {a.keyFindings.map((f, j) => (
                          <li key={j} className="text-[11px] text-muted-foreground leading-snug">
                            <Streamdown className="prose prose-xs prose-neutral max-w-none prose-p:my-0 inline">{f}</Streamdown>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stage & Evidence — only show evidence target when AI prep hasn't already covered it */}
      {(interview.stageName || (!interview.prep?.briefing && interview.evidenceTarget)) && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          {interview.stageName && (
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Interview Stage</p>
              <p className="text-sm font-medium text-foreground">{interview.stageName}</p>
            </div>
          )}
          {interview.stageCompetencies.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {interview.stageCompetencies.map((c) => (
                <span key={c} className="rounded-full border border-border bg-secondary/50 px-2.5 py-0.5 text-[10px] font-medium text-foreground">
                  {c}
                </span>
              ))}
            </div>
          )}
          {!interview.prep?.briefing && interview.evidenceTarget && (
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Evidence Target</p>
              <p className="text-sm text-foreground">{interview.evidenceTarget}</p>
            </div>
          )}
        </div>
      )}

      {/* External meeting link */}
      {interview.meetingLink && (
        <a
          href={interview.meetingLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50/50 px-4 py-3 text-xs font-medium text-neutral-600 hover:bg-neutral-50 transition-colors"
        >
          <Link2 className="h-3.5 w-3.5" />
          External meeting link
          <ExternalLink className="h-3 w-3 ml-auto text-neutral-400" />
        </a>
      )}

      {/* Notes */}
      {interview.notes && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notes</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{interview.notes}</p>
        </div>
      )}
    </div>
  );
}

/* -- Scorecard Form (shared) --------------------------------------- */

// Re-export for local use in FeedbackTab scorecard display
import { ScorecardForm, verdictToStars } from "@/components/shared/scorecard-form";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

/* -- Preparation Tab ------------------------------------------------ */

function QuestionCard({ q, idx }: { q: InterviewPrep["questions"][number]; idx: number }) {
  const [open, setOpen] = useState(false);
  const isMustAsk = q.priority === "must-ask";

  return (
    <div className={cn(
      "rounded-lg border bg-background p-4 space-y-2",
      isMustAsk ? "border-border" : "border-border/50"
    )}>
      <div className="flex items-start gap-2">
        <span className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
          isMustAsk
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground"
        )}>
          {idx}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{q.question}</p>
          <p className="text-xs text-muted-foreground mt-1">{q.purpose}</p>
        </div>
      </div>
      {q.followUps.length > 0 && (
        <div className="pl-7">
          <Button
            variant="link"
            type="button"
            onClick={() => setOpen(!open)}
            className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            {open ? "Hide" : "Show"} {q.followUps.length} follow-up{q.followUps.length > 1 ? "s" : ""}
          </Button>
          {open && (
            <ul className="mt-1 space-y-0.5">
              {q.followUps.map((f, i) => (
                <li key={i} className="text-xs text-foreground/70 pl-3 relative before:absolute before:left-0 before:top-1.5 before:h-1 before:w-1 before:rounded-full before:bg-muted-foreground/30">
                  {f}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function PreparationTab({ prep }: { prep: InterviewPrep | null }) {
  const [showOptional, setShowOptional] = useState(false);

  if (!prep) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-8 text-center">
        <BookOpen className="h-6 w-6 text-muted-foreground/30" />
        <p className="text-xs font-semibold text-foreground">Preparation is being generated...</p>
        <p className="text-xs text-muted-foreground">The interview plan will appear here once processing is complete.</p>
      </div>
    );
  }

  // Treat questions without a priority field (old data) as must-ask
  const mustAsk = prep.questions.filter((q) => q.priority !== "if-time-allows");
  const optional = prep.questions.filter((q) => q.priority === "if-time-allows");

  // Group scoring guidance by competency for inline lookup
  const scoringByCompetency = new Map(
    (prep.scoringGuidance ?? []).map((sg) => [sg.competency, sg])
  );

  // Build focus-area sections: questions + scoring guidance together
  const focusAreaSections = prep.focusAreas.map((area) => ({
    area,
    mustAskQuestions: mustAsk.filter((q) => q.competency === area),
    optionalQuestions: optional.filter((q) => q.competency === area),
    scoring: scoringByCompetency.get(area),
  }));

  // Questions that don't match any focus area
  const ungroupedMustAsk = mustAsk.filter(
    (q) => !prep.focusAreas.includes(q.competency)
  );
  const ungroupedOptional = optional.filter(
    (q) => !prep.focusAreas.includes(q.competency)
  );
  // Scoring guidance for competencies not in focus areas
  const ungroupedScoring = (prep.scoringGuidance ?? []).filter(
    (sg) => !prep.focusAreas.includes(sg.competency)
  );

  let questionCounter = 0;

  return (
    <div className="space-y-4">
      {/* Briefing */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Briefing</p>
        <p className="text-sm leading-relaxed text-foreground">{prep.briefing}</p>
      </div>

      {/* Opening — how to start the interview */}
      {prep.opening?.talkingPoints?.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Opening</p>
          <ul className="space-y-1.5">
            {prep.opening.talkingPoints.map((tp, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/30" />
                {tp}
              </li>
            ))}
          </ul>
          {prep.opening.candidateQuestionTime && (
            <p className="text-xs text-muted-foreground italic">Reserve time at the end for candidate questions.</p>
          )}
        </div>
      )}

      {/* Focus area sections — questions + scoring grouped together */}
      {focusAreaSections.map((section) => {
        const hasQuestions = section.mustAskQuestions.length > 0 || section.optionalQuestions.length > 0;
        if (!hasQuestions && !section.scoring) return null;

        return (
          <div key={section.area} className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Target className="h-3.5 w-3.5 text-foreground/50" />
              <p className="text-xs font-semibold text-foreground">{section.area}</p>
            </div>

            {/* Must-ask questions */}
            {section.mustAskQuestions.length > 0 && (
              <div className="space-y-2">
                {section.mustAskQuestions.map((q) => {
                  questionCounter++;
                  return <QuestionCard key={questionCounter} q={q} idx={questionCounter} />;
                })}
              </div>
            )}

            {/* Optional questions — collapsed */}
            {section.optionalQuestions.length > 0 && showOptional && (
              <div className="space-y-2">
                {section.optionalQuestions.map((q) => {
                  questionCounter++;
                  return <QuestionCard key={questionCounter} q={q} idx={questionCounter} />;
                })}
              </div>
            )}

            {/* Inline scoring guidance */}
            {section.scoring && (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Scoring</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-medium text-emerald-700 mb-1">Look for</p>
                    <ul className="space-y-0.5">
                      {section.scoring.lookFor.map((l, i) => (
                        <li key={i} className="text-xs text-foreground/70">+ {l}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-red-600 mb-1">Red flags</p>
                    <ul className="space-y-0.5">
                      {section.scoring.redFlags.map((r, i) => (
                        <li key={i} className="text-xs text-foreground/70">- {r}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Show/hide optional questions toggle */}
      {optional.length > 0 && (
        <Button
          variant="soft"
          type="button"
          onClick={() => setShowOptional(!showOptional)}
          className="w-full rounded-lg border-dashed py-2.5 text-xs font-medium transition-colors"
        >
          {showOptional
            ? `Hide ${optional.length} optional question${optional.length > 1 ? "s" : ""}`
            : `Show ${optional.length} more if time allows`}
        </Button>
      )}

      {/* Ungrouped questions (competency didn't match a focus area) */}
      {(ungroupedMustAsk.length > 0 || (showOptional && ungroupedOptional.length > 0)) && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Other Questions</p>
          <div className="space-y-2">
            {ungroupedMustAsk.map((q) => {
              questionCounter++;
              return <QuestionCard key={questionCounter} q={q} idx={questionCounter} />;
            })}
            {showOptional && ungroupedOptional.map((q) => {
              questionCounter++;
              return <QuestionCard key={questionCounter} q={q} idx={questionCounter} />;
            })}
          </div>
        </div>
      )}

      {/* Ungrouped scoring guidance */}
      {ungroupedScoring.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Scoring Guidance</p>
          <div className="space-y-2">
            {ungroupedScoring.map((sg) => (
              <div key={sg.competency} className="rounded-lg border border-border bg-background p-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">{sg.competency}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-medium text-emerald-700 mb-1">Look for</p>
                    <ul className="space-y-0.5">
                      {sg.lookFor.map((l, i) => (
                        <li key={i} className="text-xs text-foreground/70">+ {l}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-red-600 mb-1">Red flags</p>
                    <ul className="space-y-0.5">
                      {sg.redFlags.map((r, i) => (
                        <li key={i} className="text-xs text-foreground/70">- {r}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk flags */}
      {prep.riskFlags.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Risk Flags</p>
          </div>
          <div className="space-y-2">
            {prep.riskFlags.map((rf, idx) => (
              <div key={idx} className="rounded-lg border border-amber-200/60 bg-white/50 px-4 py-3 space-y-1">
                <p className="text-sm font-semibold text-foreground">{rf.flag}</p>
                <p className="text-xs text-foreground/70">{rf.context}</p>
                <p className="text-xs text-amber-700"><span className="font-medium">Probe:</span> {rf.suggestedProbe}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* -- Transcript Tab ------------------------------------------------ */

function RecordingStatusBanner({ status, url }: { status: string; url: string | null }) {
  if (status === "none") return null;

  const configs: Record<string, { label: string; desc: string; color: string }> = {
    recording: {
      label: "Recording in progress",
      desc: "The interview is being recorded. Transcript will be generated after the recording ends.",
      color: "border-red-200 bg-red-50/50",
    },
    processing: {
      label: "Generating transcript",
      desc: "The recording is being transcribed. This may take a few minutes.",
      color: "border-amber-200 bg-amber-50/50",
    },
    ready: {
      label: "Transcript ready",
      desc: "Live transcription has been saved.",
      color: "border-emerald-200 bg-emerald-50/50",
    },
  };

  const config = configs[status];
  if (!config) return null;

  return (
    <div className={cn("rounded-xl border p-4 space-y-2", config.color)}>
      <div className="flex items-center gap-2">
        {status === "recording" && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
        {status === "processing" && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />}
        {status === "ready" && <Check className="h-3.5 w-3.5 text-emerald-600" />}
        <p className="text-xs font-semibold text-foreground">{config.label}</p>
      </div>
      <p className="text-xs text-muted-foreground">{config.desc}</p>
      {status === "ready" && url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Download recording
        </a>
      )}
    </div>
  );
}

function TranscriptTab({ interview }: { interview: InterviewDetailProps }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(!interview.transcript && interview.recordingStatus === "none");
  const [draft, setDraft] = useState(interview.transcript ?? "");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!draft.trim()) return;
    startTransition(async () => {
      try {
        await saveTranscript(interview.id, interview.intelligenceId, draft.trim());
        setIsEditing(false);
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2000);
      } catch {
        // Error is visible via pending state clearing
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Recording status banner */}
      <RecordingStatusBanner status={interview.recordingStatus} url={interview.recordingUrl} />

      {/* Transcript display */}
      {!isEditing && interview.transcript ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Interview Transcript</p>
            <Button
              variant="soft"
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </Button>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{interview.transcript}</p>
          </div>
        </div>
      ) : isEditing ? (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {interview.transcript ? "Edit Transcript" : "Add Transcript"}
          </p>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Paste or type the interview transcript here..."
            rows={16}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-y"
          />
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              onClick={handleSave}
              disabled={isPending || !draft.trim()}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="h-3 w-3" />
                  Save Transcript
                </>
              )}
            </Button>
            {interview.transcript && (
              <Button
                variant="soft"
                onClick={() => {
                  setDraft(interview.transcript ?? "");
                  setIsEditing(false);
                }}
                className="rounded-lg px-4 py-2 text-xs font-medium transition-colors"
              >
                Cancel
              </Button>
            )}
            {saved && (
              <span className="text-xs text-emerald-600 font-medium">Saved!</span>
            )}
          </div>
        </div>
      ) : !interview.transcript && interview.recordingStatus !== "none" ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-8 text-center">
          <FileText className="h-6 w-6 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">
            {interview.recordingStatus === "processing"
              ? "Transcript is being generated from the recording..."
              : "No transcript available yet."}
          </p>
          <Button
            variant="link"
            onClick={() => setIsEditing(true)}
            className="text-xs font-medium"
          >
            Add transcript manually
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* -- Feedback Tab --------------------------------------------------- */

function FeedbackTab({ interview, currentUserId }: { interview: InterviewDetailProps; currentUserId: string }) {
  const [scorecards, setScorecards] = useState(interview.scorecards);
  const router = useRouter();

  // Check if the current user already has a scorecard
  const userScorecard = scorecards.find((sc) => sc.reviewerId === currentUserId);
  const [showForm, setShowForm] = useState(!userScorecard && scorecards.length === 0);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* Existing scorecards */}
      {scorecards.length > 0 && (
        <div className="space-y-3">
          {scorecards.map((sc) => (
            <div key={sc.id}>
              {editingId === sc.id ? (
                <div className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-semibold text-foreground">Edit Your Scorecard</p>
                    <Button
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </Button>
                  </div>
                  <ScorecardForm
                    interviewId={interview.id}
                    competencies={interview.stageCompetencies}
                    existingRatings={sc.ratings}
                    existingVerdict={sc.verdict}
                    existingNotes={sc.notes}
                    requireVerdict
                    onSubmitted={(updated) => {
                      setScorecards((prev) => prev.map((s) => s.id === sc.id ? { ...s, ...updated } : s));
                      setEditingId(null);
                      router.refresh();
                    }}
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-[10px] font-semibold text-sky-700">
                        {(sc.reviewerName ?? "R").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{sc.reviewerName ?? "Reviewer"}</p>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          {sc.verdict && (() => {
                            const stars = verdictToStars(sc.verdict);
                            return (
                              <span className="flex gap-px">
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <Star key={n} className={cn("h-3 w-3", stars >= n ? "fill-amber-400 text-amber-400" : "text-border")} />
                                ))}
                              </span>
                            );
                          })()}
                          {sc.createdAt && <span>{sc.verdict ? " · " : ""}{new Date(sc.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {sc.reviewerId === currentUserId && (
                        <Button
                          variant="soft"
                          onClick={() => setEditingId(sc.id)}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </Button>
                      )}
                      {sc.verdict && (
                        <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-semibold capitalize", verdictColor(sc.verdict))}>
                          {sc.verdict.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Competency ratings */}
                  {sc.ratings.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {sc.ratings.map((r) => (
                        <span
                          key={r.competency}
                          className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2.5 py-0.5 text-[10px] font-medium text-foreground"
                        >
                          {r.competency}
                          <span className="flex gap-px">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <Star key={n} className={cn("h-2.5 w-2.5", r.rating >= n ? "fill-amber-400 text-amber-400" : "text-border")} />
                            ))}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  {sc.notes && <p className="text-sm leading-relaxed text-foreground/80">{sc.notes}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Scorecard form - only show if user hasn't submitted one */}
      {!userScorecard && (
        showForm ? (
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs font-semibold text-foreground mb-4">Add Your Scorecard</p>
            <ScorecardForm
              interviewId={interview.id}
              competencies={interview.stageCompetencies}
              requireVerdict
              onSubmitted={(sc) => {
                setScorecards((prev) => [...prev, sc]);
                setShowForm(false);
                router.refresh();
              }}
            />
          </div>
        ) : (
          <Button
            variant="ghost"
            onClick={() => setShowForm(true)}
            className="w-full rounded-xl border border-dashed border-border py-4 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            + Add your scorecard
          </Button>
        )
      )}
    </div>
  );
}

/* -- Main Component ------------------------------------------------ */

export default function InterviewDetailClient({ currentUserId, errorMessage, ...interview }: InterviewDetailProps & { currentUserId: string; errorMessage?: string }) {
  const [activeTab, setActiveTab] = useState<Tab>("info");
  const [showError, setShowError] = useState(!!errorMessage);
  const [copied, setCopied] = useState(false);

  // Auto-refresh when this interview or its scorecard changes
  useEntityEvent(["interview", "scorecard"]);

  const copyCandidateLink = async () => {
    if (!interview.candidateToken) return;
    // Use external meeting link if provided, otherwise use LiveKit room
    const link = interview.meetingLink
      ? interview.meetingLink
      : `${typeof window !== 'undefined' ? window.location.origin : ''}/interviews/${interview.id}/room?token=${interview.candidateToken}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="space-y-8">
          {/* Error banner */}
          {showError && errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4" />
                {errorMessage}
              </div>
              <Button
                variant="ghost"
                onClick={() => setShowError(false)}
                className="text-red-500 hover:text-red-700"
              >
                <span className="sr-only">Dismiss</span>
                ×
              </Button>
            </div>
          )}
          {/* Back */}
          <Link
            href="/recruit/interviews"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Interviews
          </Link>

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                  {interview.candidateName ? (
                    <Link href={`/recruit/candidates/${interview.candidateId}`} className="hover:underline">
                      {interview.candidateName}
                    </Link>
                  ) : "Interview"}
                  {interview.roleName && (
                    <span className="text-muted-foreground font-normal"> → </span>
                  )}
                  {interview.roleName && (
                    <Link href={`/recruit/roles/${interview.roleId}`} className="hover:underline">
                      {interview.roleName}
                    </Link>
                  )}
                </h1>
                {statusBadge(interview.status)}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {interview.stageName && <span className="font-medium">{interview.stageName}</span>}
                {interview.scheduledAt && (
                  <>
                    {interview.stageName && <span className="text-border">|</span>}
                    <span>{formatDateTime(interview.scheduledAt)}</span>
                  </>
                )}
                <span className="text-border">|</span>
                <span>{interview.durationMins ?? 45} min</span>
                <span className="text-border">|</span>
                <span className="capitalize">{(interview.interviewType ?? "interview").replace(/_/g, " ")}</span>
                {interview.panelistNames.length > 0 && (
                  <>
                    <span className="text-border">|</span>
                    <span>with {interview.panelistNames.join(", ")}</span>
                  </>
                )}
                {interview.location && (
                  <>
                    <span className="text-border">|</span>
                    <span>{interview.location}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!interview.meetingLink && interview.scheduledAt && interview.status !== "cancelled" && interview.status !== "completed" && (
                <JoinRoomButton interviewId={interview.id} scheduledAt={interview.scheduledAt} durationMins={interview.durationMins} variant="compact" />
              )}
              {interview.candidateToken && interview.status !== "cancelled" && interview.status !== "completed" && (
                <Button
                  variant="soft"
                  size="auto"
                  onClick={copyCandidateLink}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                  title="Copy candidate join link"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600" />
                      Link Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Candidate Link
                    </>
                  )}
                </Button>
              )}
              <AskAIButton entity="interview" id={interview.id} view="detail" data={{...interview}} />
              <Link
                href={`/recruit/interviews/${interview.id}/edit`}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Link>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-border">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const count = tab.key === "feedback" ? interview.scorecards.length
                : tab.key === "activity" ? interview.activityLog.length
                : null;
              return (
                <Button
                  variant="ghost"
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2",
                    activeTab === tab.key
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {tab.label}
                  {count !== null && count > 0 && (
                    <span className={cn(
                      "rounded-full px-1.5 py-0 text-[9px] tabular-nums font-semibold",
                      activeTab === tab.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                    )}>
                      {count}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>

          {/* Tab content */}
          {activeTab === "info" && <div id="tour-interview-info"><InfoTab interview={interview} /></div>}
          {activeTab === "preparation" && <div id="tour-interview-prep"><PreparationTab prep={interview.prep} /></div>}
          {activeTab === "transcript" && <TranscriptTab interview={interview} />}
          {activeTab === "feedback" && <div id="tour-interview-feedback"><FeedbackTab interview={interview} currentUserId={currentUserId} /></div>}
          {activeTab === "activity" && (
            <EntityActivity entries={interview.activityLog} entityType="interview" entityId={interview.id} />
          )}
        </div>
      </div>
    </div>
  );
}

