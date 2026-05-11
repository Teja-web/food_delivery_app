"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Calendar,
  ChevronRight,
  CircleAlert,
  Clock,
  FileText,
  Flag,
  Lightbulb,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  PhoneCall,
  Send,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AskAIButton } from "@/components/shared/ask-ai-button";
import { TriageItem } from "@/components/TriageItem";
import { Button } from "@/components/ui/button";
import { useEntityEvent } from "@/hooks/use-entity-event";
import { sendCandidateMessage, logCandidateTouchpoint, updateOrgCandidateStatus } from "@/actions/candidates";
import { addEntityNote } from "@/actions/entity-notes";
import { addMatchToPipeline, dismissMatch } from "@/actions/pipeline";
import { ORG_CANDIDATE_STATUSES } from "@/db/schema/candidates";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* -- Types --------------------------------------------------------- */

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type {
  SerializedCandidate,
  SerializedPipeline,
  SerializedCandidateMatch,
  SerializedIntelligence,
  SerializedAssessment,
  SerializedPillar,
  TimelineEntry,
  CandidateDetailProps,
} from "./serialize";

/* -- Helpers --------------------------------------------------------- */

function stageColor(stage: string) {
  switch (stage) {
    case "offer": return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "interview": return "text-amber-700 bg-amber-50 border-amber-200";
    case "withdrawn": return "text-stone-500 bg-stone-50 border-stone-200";
    case "rejected": return "text-red-600 bg-red-50 border-red-200";
    default: return "text-muted-foreground bg-secondary border-border";
  }
}

function channelIcon(channel: string | null) {
  switch (channel) {
    case "phone": return <PhoneCall className="h-3 w-3 text-green-500" />;
    case "in_person": return <Users className="h-3 w-3 text-violet-500" />;
    case "video": return <Calendar className="h-3 w-3 text-amber-500" />;
    case "email": return <Send className="h-3 w-3 text-blue-500" />;
    case "linkedin": return <Mail className="h-3 w-3 text-sky-500" />;
    default: return <Clock className="h-3 w-3 text-muted-foreground" />;
  }
}

function relativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function relativeDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const CHANNEL_LABELS: Record<string, string> = {
  phone: "Phone",
  email: "Email",
  in_person: "In person",
  video: "Video",
  linkedin: "LinkedIn",
  other: "Other",
};

const CHANNELS = [
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "in_person", label: "In person" },
  { value: "video", label: "Video" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "other", label: "Other" },
];

/* -- Assessment helpers ---------------------------------------------- */

function ratingColor(rating: string) {
  if (rating.startsWith("AAA") || rating === "AA") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (rating === "A" || rating === "BBB") return "text-amber-700 bg-amber-50 border-amber-200";
  if (rating === "BB" || rating === "B") return "text-orange-600 bg-orange-50 border-orange-200";
  return "text-red-600 bg-red-50 border-red-200";
}

function pillarBarColor(score: number) {
  if (score >= 80) return "bg-emerald-400/70";
  if (score >= 65) return "bg-amber-400/70";
  return "bg-red-400/70";
}

/**
 * AI agents prefix signal text with `<key>: <n/m> [— ]<text>` (the criterion key
 * and a sub-rating). Useful in the JSON, but noisy in UI — strip it for display.
 *
 * Handles:
 *   "backendDevelopment: 3/4 — Delivered multiple…"  (camelCase + em dash)
 *   "Python Development: 3/4 — Strong skills"        (multi-word key)
 *   "Python Development: 3/4 Strong skills"          (no dash separator)
 *   "Python Development: 3/4"                        (no description; collapses to "")
 */
function cleanSignal(raw: string): string {
  return raw
    .replace(/^[A-Za-z][A-Za-z0-9 _-]*:\s*\d+\/\d+\s*[—–-]?\s*/, "")
    .trim();
}

function outlookLabel(outlook: string) {
  switch (outlook) {
    case "positive": return { text: "Positive", className: "text-emerald-700" };
    case "negative": return { text: "Negative", className: "text-red-600" };
    default: return { text: "Stable", className: "text-muted-foreground" };
  }
}

function confidenceLabel(confidence: string) {
  switch (confidence) {
    case "high": return { text: "High", className: "text-emerald-700" };
    case "low": return { text: "Low", className: "text-amber-700" };
    default: return { text: "Medium", className: "text-muted-foreground" };
  }
}

const ORG_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  talent_pool: { label: "Talent Pool", className: "text-blue-700 bg-blue-50 border-blue-200" },
  do_not_hire: { label: "Do Not Hire", className: "text-red-700 bg-red-50 border-red-200" },
  archived: { label: "Archived", className: "text-stone-500 bg-stone-50 border-stone-200" },
  alumni: { label: "Alumni", className: "text-violet-700 bg-violet-50 border-violet-200" },
};

/* -- Pillar Card ----------------------------------------------------- */

function PillarCard({ pillar }: { pillar: SerializedPillar }) {
  const cleaned = pillar.signals.map(cleanSignal).filter(Boolean);
  const detail = cleaned.join(" · ");
  const tooltip = cleaned.length > 0
    ? `${pillar.label} (${pillar.score})\n• ${cleaned.join("\n• ")}`
    : `${pillar.label}: ${pillar.score}`;
  return (
    <div className="flex items-start gap-3 py-1.5" title={tooltip}>
      <span className="w-44 shrink-0 text-[11px] font-medium text-foreground">{pillar.label}</span>
      <div
        className="mt-1.5 h-1 w-32 shrink-0 overflow-hidden rounded-full bg-border/40"
        role="progressbar"
        aria-valuenow={pillar.score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pillar.label}: ${pillar.score}`}
      >
        <div
          className={cn("h-full rounded-full", pillarBarColor(pillar.score))}
          style={{ width: `${Math.min(100, Math.max(0, pillar.score))}%` }}
        />
      </div>
      <span className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted-foreground">
        {detail || <span className="italic">No signals captured</span>}
      </span>
    </div>
  );
}

/* -- Score Breakdown (right-rail inline) ----------------------------- */

function ScoreBreakdown({ intelligence }: { intelligence: SerializedIntelligence | null }) {
  const assessment = intelligence?.assessment;

  if (!assessment) {
    // Legacy fallback for old-style scores
    if (!intelligence?.scores || Object.keys(intelligence.scores).length === 0) return null;
    return (
      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Score breakdown</h2>
        <div className="space-y-1.5">
          {Object.entries(intelligence.scores).map(([pillar, score]) => (
            <div key={pillar} className="flex items-start gap-3">
              <span className={cn("text-xs font-semibold tabular-nums w-8 shrink-0", score >= 85 ? "text-emerald-700" : score >= 70 ? "text-amber-700" : "text-red-600")}>{score}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground capitalize">{pillar}</p>
                {intelligence.signals?.[pillar] && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">{intelligence.signals[pillar]}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const outlook = outlookLabel(assessment.outlook);
  const confidence = confidenceLabel(assessment.confidence);

  return (
    <section>
      <div className="mb-2 flex items-baseline gap-3">
        <h2 className="text-sm font-semibold text-foreground">Talent assessment</h2>
        <span className="text-[11px] text-muted-foreground">
          Outlook <span className={cn("font-semibold", outlook.className)}>{outlook.text}</span>
          <span className="mx-2 text-muted-foreground/40">·</span>
          Confidence <span className={cn("font-semibold", confidence.className)}>{confidence.text}</span>
        </span>
      </div>
      <div className="border-t border-border pt-1 divide-y divide-border/40">
        {assessment.pillars.map((p) => (
          <PillarCard key={p.pillar} pillar={p} />
        ))}
      </div>
      {assessment.gaps.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <Flag className="h-3 w-3 text-amber-500" />
            Gaps
          </p>
          <ul className="space-y-1">
            {assessment.gaps.map((gap, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                <span>{gap}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* -- Pipeline / Match row helpers ------------------------------------ */

function recommendationBadge(rec: string | null): { label: string; className: string } | null {
  switch (rec) {
    case "strong_yes": return { label: "Strong yes", className: "bg-emerald-100 text-emerald-800" };
    case "yes": return { label: "Yes", className: "bg-blue-100 text-blue-800" };
    case "maybe": return { label: "Maybe", className: "bg-amber-100 text-amber-800" };
    case "no": return { label: "No", className: "bg-secondary text-secondary-foreground" };
    case "strong_no": return { label: "Strong no", className: "bg-red-100 text-red-800" };
    default: return null;
  }
}

function scoreColor(score: number | null) {
  if (score === null) return "text-muted-foreground/60 bg-muted border-border";
  if (score >= 80) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (score >= 60) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-foreground/70 bg-secondary border-border";
}

function PipelineRow({ pipeline, isPast = false }: { pipeline: SerializedPipeline; isPast?: boolean }) {
  return (
    <Link
      href={`/recruit/roles/${pipeline.roleId}`}
      className="group block border-b border-border/60 last:border-b-0 px-4 py-2.5 hover:bg-secondary/30 transition-colors"
    >
      {/* Title row */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={cn("text-sm font-semibold", isPast ? "text-muted-foreground" : "text-foreground")}>
            {pipeline.roleName}
          </span>
          <span className={cn("rounded-full border px-1.5 py-0 text-[10px] font-semibold capitalize shrink-0", stageColor(pipeline.stage))}>
            {pipeline.stage}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0 text-[11px] text-muted-foreground">
          {pipeline.roleTeam && <span className="hidden md:inline">{pipeline.roleTeam}</span>}
          {pipeline.fitScore !== null && (
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-semibold tabular-nums", scoreColor(pipeline.fitScore))}>
              {pipeline.fitScore}
            </span>
          )}
          <span className="tabular-nums whitespace-nowrap">
            {isPast ? relativeDate(pipeline.createdAt) : `${pipeline.daysInStage ?? 0}d in stage`}
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
        </div>
      </div>
      {/* Signal — full width below */}
      {pipeline.signal && (
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{pipeline.signal}</p>
      )}
    </Link>
  );
}

function MatchedRoleRow({
  match,
  pending,
  onAdd,
  onDismiss,
}: {
  match: SerializedCandidateMatch;
  pending: boolean;
  onAdd: () => void;
  onDismiss: () => void;
}) {
  const recBadge = recommendationBadge(match.recommendation);
  return (
    <div className="group block border-b border-border/60 last:border-b-0 px-4 py-2.5 hover:bg-secondary/30 transition-colors">
      {/* Title row — same shape as PipelineRow */}
      <div className="flex items-center gap-3">
        <Link href={`/recruit/roles/${match.roleId}`} className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-sm font-semibold text-foreground">{match.roleName}</span>
          {recBadge && (
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold shrink-0 whitespace-nowrap", recBadge.className)}>
              {recBadge.label}
            </span>
          )}
        </Link>
        <div className="flex items-center gap-3 shrink-0">
          {match.roleTeam && (
            <span className="text-[11px] text-muted-foreground hidden md:inline">{match.roleTeam}</span>
          )}
          {match.fitScore !== null && (
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-semibold tabular-nums", scoreColor(match.fitScore))}>
              {match.fitScore}
            </span>
          )}
          <Button variant="soft" size="sm" disabled={pending} onClick={onDismiss} className="text-[11px]">
            Dismiss
          </Button>
          <Button size="sm" disabled={pending} onClick={onAdd} className="text-[11px]">
            <ArrowRight className="h-3 w-3" />
            Add to pipeline
          </Button>
        </div>
      </div>
      {/* Signal line — full-width below */}
      {match.signal && (
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{match.signal}</p>
      )}
    </div>
  );
}

/* -- Component ------------------------------------------------------- */

export default function CandidateProfileClient({ candidate, pipelines, matches, timeline, intelligence }: CandidateDetailProps) {
  // Auto-refresh when this candidate or related entities change
  useEntityEvent(["candidate", "application", "engagement", "assessment", "match"]);

  const router = useRouter();
  const [matchPending, startMatchTransition] = useTransition();

  // Send message dialog state
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [orgStatus, setOrgStatus] = useState(candidate.orgStatus);
  const [orgStatusOpen, setOrgStatusOpen] = useState(false);

  // Activity input state
  const [activityMode, setActivityMode] = useState<"note" | "touchpoint">("note");
  const [noteBody, setNoteBody] = useState("");
  const [tpChannel, setTpChannel] = useState("phone");
  const [tpSubject, setTpSubject] = useState("");
  const [tpBody, setTpBody] = useState("");
  const [activityPending, startActivityTransition] = useTransition();

  const handleSendMessage = async () => {
    if (!messageSubject.trim() || !messageBody.trim()) return;
    setSendingMessage(true);
    setMessageError(null);
    const result = await sendCandidateMessage(candidate.id, messageSubject, messageBody);
    setSendingMessage(false);
    if (result.success) {
      setMessageDialogOpen(false);
      setMessageSubject("");
      setMessageBody("");
    } else {
      setMessageError(result.error || "Failed to send message");
    }
  };

  const activePipelines = pipelines.filter((p) => !["withdrawn", "rejected", "hired"].includes(p.stage));
  const pastPipelines = pipelines.filter((p) => ["withdrawn", "rejected", "hired"].includes(p.stage));

  // Active triage items get promoted to a banner above the body. Resolved
  // triage stays in the activity timeline as historical record.
  const activeTriage = timeline.filter(
    (t): t is Extract<TimelineEntry, { kind: "triage" }> =>
      t.kind === "triage" && t.status !== "resolved",
  );
  const visibleTimeline = timeline.filter((t) => t.kind !== "triage" || t.status === "resolved");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1600px] px-6 py-6">
        <div className="space-y-5">
          <Link href="/recruit/candidates" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3 w-3" />
            All candidates
          </Link>

          {/* Profile header — flat, no card outline */}
          <div>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-display text-xl font-bold tracking-tight text-foreground">{candidate.name}</h1>
                  <div className="relative">
                    <Button
                      variant="unstyled"
                      onClick={() => setOrgStatusOpen(!orgStatusOpen)}
                      className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold border cursor-pointer hover:opacity-80 transition-opacity", ORG_STATUS_CONFIG[orgStatus]?.className ?? "bg-secondary text-muted-foreground border-border")}
                    >
                      {ORG_STATUS_CONFIG[orgStatus]?.label ?? orgStatus}
                    </Button>
                    {orgStatusOpen && (
                      <div className="absolute top-full left-0 mt-1 z-50 rounded-lg border border-border bg-card shadow-lg py-1 min-w-[140px]">
                        {ORG_CANDIDATE_STATUSES.map((s) => (
                          <Button
                            variant="ghost"
                            key={s}
                            onClick={async () => {
                              setOrgStatus(s);
                              setOrgStatusOpen(false);
                              await updateOrgCandidateStatus(candidate.id, s);
                            }}
                            className={cn("w-full text-left px-3 py-1.5 text-xs hover:bg-secondary transition-colors", s === orgStatus && "font-semibold")}
                          >
                            {ORG_STATUS_CONFIG[s]?.label ?? s}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                  {candidate.talentScore !== null && intelligence?.assessment?.rating && (
                    <span
                      id="tour-candidate-grade"
                      className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums", ratingColor(intelligence.assessment.rating))}
                      title={`Talent grade: ${intelligence.assessment.rating} · score ${candidate.talentScore}`}
                    >
                      {intelligence.assessment.rating} · {candidate.talentScore}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {candidate.title || "No title"}{candidate.company ? ` at ${candidate.company}` : ""}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {candidate.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{candidate.location}</span>}
                  <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{candidate.email}</span>
                  {candidate.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{candidate.phone}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <AskAIButton entity="candidate" id={candidate.id} view="detail" data={{ candidate, pipelines, matches, timeline, intelligence }} />
                {candidate.resumeUrl && (
                  <a
                    href={candidate.resumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    title="Open resume"
                  >
                    <FileText className="h-3 w-3" />
                    Resume
                  </a>
                )}
                <Link href={`/recruit/candidates/${candidate.id}/edit`} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <Pencil className="h-3 w-3" />
                  Edit
                </Link>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setMessageDialogOpen(true)}
                  disabled={!candidate.email}
                  className="rounded-md text-xs font-semibold"
                >
                  <Send className="h-3 w-3" />
                  Send message
                </Button>
              </div>
            </div>

            {candidate.summary && (
              <p className="mt-3 text-xs leading-relaxed text-foreground/80" title={candidate.summary}>
                {candidate.summary}
              </p>
            )}
          </div>

          {/* Active triage — promoted above the body so it's not buried in activity */}
          {activeTriage.length > 0 && (
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {activeTriage.map((t) => (
                <TriageItem
                  key={t.id}
                  title={t.title}
                  action={t.action}
                  subtitle={t.subtitle}
                  urgency={t.urgency}
                  className="px-4 py-3"
                />
              ))}
            </div>
          )}

          {/* Talent assessment — full width so the pillars breathe */}
          <ScoreBreakdown intelligence={intelligence} />

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left column: pipelines, matches, activity */}
            <div className="space-y-6 min-w-0">
              {/* Pipelines */}
              <section id="tour-candidate-pipelines">
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    Pipelines
                  </h2>
                  {(activePipelines.length > 0 || pastPipelines.length > 0) && (
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {activePipelines.length} active{pastPipelines.length > 0 ? ` \u00B7 ${pastPipelines.length} past` : ""}
                    </span>
                  )}
                </div>
                {activePipelines.length > 0 ? (
                  <div className="border-t border-border">
                    {activePipelines.map((pipeline) => (
                      <PipelineRow key={pipeline.id} pipeline={pipeline} />
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground italic">Not in any active pipeline.</p>
                )}

                {pastPipelines.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Past</p>
                    <div className="border-t border-border">
                      {pastPipelines.map((pipeline) => (
                        <PipelineRow key={pipeline.id} pipeline={pipeline} isPast />
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Matched roles */}
              <section id="tour-candidate-matches">
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                    Matched roles
                  </h2>
                  {matches.length > 0 && (
                    <span className="text-[11px] text-muted-foreground tabular-nums">{matches.length}</span>
                  )}
                </div>
                {matches.length > 0 ? (
                  <div className="border-t border-border">
                    {matches.map((m) => (
                      <MatchedRoleRow
                        key={m.id}
                        match={m}
                        pending={matchPending}
                        onAdd={() => startMatchTransition(async () => { await addMatchToPipeline(m.id, m.roleId, candidate.id); })}
                        onDismiss={() => startMatchTransition(async () => { await dismissMatch(m.id); })}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground italic">No matched roles yet.</p>
                )}
              </section>

              {/* Activity timeline */}
              <section>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Activity
                  </h2>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{visibleTimeline.length}</span>
                </div>

                {/* Input area */}
                <div className="mb-6">
                  <div className="flex gap-1 mb-3">
                    <Button
                      variant={activityMode === "note" ? "default" : "ghost"}
                      onClick={() => setActivityMode("note")}
                      className={cn("rounded-lg px-3 py-1.5 text-[11px] font-medium", activityMode !== "note" && "text-muted-foreground")}
                    >
                      <MessageSquare className="h-3 w-3 mr-1.5" />
                      Note
                    </Button>
                    <Button
                      variant={activityMode === "touchpoint" ? "default" : "ghost"}
                      onClick={() => setActivityMode("touchpoint")}
                      className={cn("rounded-lg px-3 py-1.5 text-[11px] font-medium", activityMode !== "touchpoint" && "text-muted-foreground")}
                    >
                      <PhoneCall className="h-3 w-3 mr-1.5" />
                      Log touchpoint
                    </Button>
                  </div>

                  {activityMode === "note" ? (
                    <div>
                      <Textarea
                        value={noteBody}
                        onChange={(e) => setNoteBody(e.target.value)}
                        placeholder="Write a note..."
                        rows={3}
                        className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 resize-none transition-colors"
                      />
                      <div className="flex justify-end mt-2">
                        <Button
                          variant="default"
                          disabled={activityPending || !noteBody.trim()}
                          onClick={() => {
                            const body = noteBody.trim();
                            if (!body) return;
                            startActivityTransition(async () => {
                              await addEntityNote("candidate", candidate.id, body);
                              setNoteBody("");
                              router.refresh();
                            });
                          }}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium hover:opacity-90 transition-opacity disabled:opacity-30"
                        >
                          {activityPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                          Add note
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-[11px] font-semibold text-muted-foreground">Channel</Label>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {CHANNELS.map((c) => (
                            <Button
                              key={c.value}
                              variant={tpChannel === c.value ? "default" : "outline"}
                              onClick={() => setTpChannel(c.value)}
                              className={cn("rounded-lg px-2.5 py-1 text-[11px]", tpChannel !== c.value && "text-muted-foreground")}
                            >
                              {c.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label className="text-[11px] font-semibold text-muted-foreground">Subject</Label>
                        <Input
                          value={tpSubject}
                          onChange={(e) => setTpSubject(e.target.value)}
                          placeholder="Brief description..."
                          className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] font-semibold text-muted-foreground">Notes <span className="font-normal">(optional)</span></Label>
                        <Textarea
                          value={tpBody}
                          onChange={(e) => setTpBody(e.target.value)}
                          placeholder="Details about the conversation..."
                          rows={2}
                          className="mt-1.5 w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none transition-colors"
                        />
                      </div>
                      <div className="flex justify-end">
                        <Button
                          variant="default"
                          disabled={activityPending || !tpSubject.trim()}
                          onClick={() => {
                            const subject = tpSubject.trim();
                            if (!subject) return;
                            startActivityTransition(async () => {
                              await logCandidateTouchpoint(candidate.id, {
                                type: "outreach",
                                channel: tpChannel,
                                subject,
                                body: tpBody.trim() || undefined,
                              });
                              setTpSubject("");
                              setTpBody("");
                              router.refresh();
                            });
                          }}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium hover:opacity-90 transition-opacity disabled:opacity-30"
                        >
                          {activityPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <PhoneCall className="h-3 w-3" />}
                          Log touchpoint
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Unified timeline — no empty-state copy; the input above is the affordance */}
                {visibleTimeline.length > 0 && (
                  <div>
                    {visibleTimeline.map((entry, idx) => {
                      const isLast = idx === visibleTimeline.length - 1;

                      if (entry.kind === "note") {
                        return (
                          <div key={entry.id} className="relative flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/10">
                                <MessageSquare className="h-3 w-3 text-sky-500" />
                              </div>
                              {!isLast && <div className="w-px flex-1 bg-border/60 mt-1" />}
                            </div>
                            <div className={cn("min-w-0 flex-1", !isLast && "pb-5")}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap">{entry.body}</p>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">{entry.createdByName ?? "Unknown"}</p>
                                </div>
                                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground pt-0.5">{relativeAge(entry.createdAt)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (entry.kind === "engagement") {
                        const isLogged = entry.status === "logged";
                        return (
                          <div key={entry.id} className="relative flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary">
                                {channelIcon(entry.channel)}
                              </div>
                              {!isLast && <div className="w-px flex-1 bg-border/60 mt-1" />}
                            </div>
                            <div className={cn("min-w-0 flex-1", !isLast && "pb-5")}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium leading-snug text-foreground">{entry.subject || entry.body || `${entry.type} engagement`}</p>
                                  {entry.body && entry.subject && (
                                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed whitespace-pre-wrap">{entry.body}</p>
                                  )}
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    {isLogged ? entry.createdByName ?? "Unknown" : "System"}
                                    {entry.channel ? ` · ${CHANNEL_LABELS[entry.channel] ?? entry.channel}` : ""}
                                  </p>
                                </div>
                                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground pt-0.5">{relativeAge(entry.createdAt)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      // Triage entry
                      const isHigh = entry.urgency === "high" || entry.urgency === "critical";
                      const isMedium = entry.urgency === "medium";
                      const isResolved = entry.status === "resolved";
                      const Icon = isResolved ? Clock : isHigh ? AlertTriangle : isMedium ? CircleAlert : Lightbulb;
                      const iconColor = isResolved ? "text-muted-foreground/40" : isHigh ? "text-red-500" : "text-amber-500";
                      const dotBg = isResolved ? "bg-muted/50" : isHigh ? "bg-red-50 dark:bg-red-950/40" : isMedium ? "bg-amber-50 dark:bg-amber-950/40" : "bg-amber-50 dark:bg-amber-950/30";

                      return (
                        <div key={entry.id} className="relative flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full", dotBg)}>
                              <Icon className={cn("h-3 w-3", iconColor)} />
                            </div>
                            {!isLast && <div className={cn("w-px flex-1 mt-1", isResolved ? "bg-border/40" : isHigh ? "bg-red-200 dark:bg-red-900/30" : "bg-border")} />}
                          </div>
                          <div className={cn("min-w-0 flex-1", !isLast && "pb-5")}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className={cn("text-xs font-medium leading-snug", isResolved ? "text-muted-foreground" : "text-foreground")}>{entry.title}</p>
                                {entry.subtitle && <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{entry.subtitle}</p>}
                                {entry.action && !isResolved && (
                                  <p className={cn("mt-1 flex items-center gap-1 text-[11px] font-medium", isHigh ? "text-red-600 dark:text-red-400" : isMedium ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                                    <ArrowRight className="h-2.5 w-2.5" />
                                    {entry.action}
                                  </p>
                                )}
                              </div>
                              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground pt-0.5">{relativeAge(entry.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            {/* Right rail: experience + education + skills */}
            <aside className="space-y-6 min-w-0">
              {candidate.experience.length > 0 && (
                <section>
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    Experience
                    <span className="text-[11px] font-normal text-muted-foreground tabular-nums">{candidate.experience.length}</span>
                  </h2>
                  <div className="space-y-3 border-t border-border pt-2">
                    {candidate.experience.map((exp, idx) => (
                      <div key={idx} className="text-xs">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="font-semibold text-foreground">{exp.title}</p>
                          {(exp.startDate || exp.endDate) && (
                            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                              {exp.startDate}{exp.endDate ? ` – ${exp.endDate}` : " – Present"}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{exp.company}</p>
                        {exp.description && (
                          <p className="mt-1 text-[11px] leading-relaxed text-foreground/80 whitespace-pre-wrap">{exp.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {candidate.education.length > 0 && (
                <section>
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                    Education
                    <span className="text-[11px] font-normal text-muted-foreground tabular-nums">{candidate.education.length}</span>
                  </h2>
                  <div className="space-y-2 border-t border-border pt-2">
                    {candidate.education.map((edu, idx) => (
                      <div key={idx} className="flex items-baseline justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</p>
                          <p className="text-[11px] text-muted-foreground">{edu.institution}</p>
                        </div>
                        {edu.year && <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{edu.year}</span>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {candidate.skills.length > 0 && (
                <section>
                  <h2 className="mb-2 text-sm font-semibold text-foreground">Skills</h2>
                  <div className="flex flex-wrap gap-1.5">
                    {candidate.skills.map((skill) => (
                      <span key={skill} className="rounded border border-border bg-secondary/50 px-2 py-0.5 text-[10px] font-medium text-foreground/80">{skill}</span>
                    ))}
                  </div>
                </section>
              )}
            </aside>
          </div>
        </div>
      </div>

      {/* Send message dialog */}
      <Dialog open={messageDialogOpen} onOpenChange={setMessageDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send message to {candidate.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-semibold text-foreground">To</Label>
              <p className="mt-1 text-sm text-muted-foreground">{candidate.email}</p>
            </div>
            <div>
              <Label className="text-xs font-semibold text-foreground">Subject</Label>
              <Input
                type="text"
                value={messageSubject}
                onChange={(e) => setMessageSubject(e.target.value)}
                placeholder="Enter subject..."
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-foreground">Message</Label>
              <Textarea
                rows={6}
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder="Write your message..."
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
            {messageError && (
              <p className="text-xs text-red-600">{messageError}</p>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="soft"
                onClick={() => setMessageDialogOpen(false)}
                className="rounded-lg px-4 py-2 text-xs font-medium transition-colors"
              >
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={handleSendMessage}
                disabled={sendingMessage || !messageSubject.trim() || !messageBody.trim()}
                className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {sendingMessage ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-3 w-3" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
