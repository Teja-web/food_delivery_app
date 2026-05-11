"use client";

/**
 * MatchRow — compact ~52px row for the EntityListDetail left rail.
 *
 * Renders the dense scanning view of a candidate match. Used by:
 *   - Recommended tab (Phase 1)
 *   - Pipeline tab (Phase 2)
 *
 * The full rich render lives in <MatchCard> (in the right detail pane).
 * This component is the at-a-glance triage view.
 */

import { Check, Clock, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { fitColor, fitConfidenceTooltip, type MatchCardEvidenceBasis, type MatchCardInterviewProgress } from "./match-card";

export type MatchRowProps = {
  candidateId: string;
  candidateName: string;

  fitScore: number | null;
  /** "strong_yes" | "yes" | "maybe" | "no" | "strong_no" */
  recommendation: string | null;
  evidenceBasis?: MatchCardEvidenceBasis;
  signal: string | null;

  // Pipeline-only — omit for Recommended
  daysInStage?: number | null;
  isStale?: boolean;
  interviewProgress?: MatchCardInterviewProgress[];
  lastNotePreview?: string;

  // Recommended-only — omit for Pipeline
  matchedAt?: string;
  poolBadge?: string;
  recencyBadge?: "new" | "re-engage" | null;

  // State
  selected: boolean;
  focused: boolean;
  onToggleSelect: () => void;
};

export function MatchRow(props: MatchRowProps) {
  const recBadge = recommendationBadge(props.recommendation);

  const showStepper = (props.interviewProgress?.length ?? 0) > 0;
  const showNote = !showStepper && !!props.lastNotePreview;
  const showPool = !showStepper && !showNote && !!props.poolBadge;

  return (
    <div
      className={cn(
        "px-3 py-2.5 flex items-start gap-3",
        props.focused && "border-l-2 border-primary",
      )}
    >
      <input
        type="checkbox"
        className="mt-1 rounded border-border"
        checked={props.selected}
        onClick={(e) => e.stopPropagation()}
        onChange={props.onToggleSelect}
      />

      <div className="flex-1 min-w-0">
        {/* Row 1: name · rec label · score · timestamp */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{props.candidateName}</span>
          {recBadge && (
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 whitespace-nowrap",
                recBadge.className,
              )}
              title={recBadge.title}
            >
              {recBadge.label}
            </span>
          )}
          {props.fitScore !== null && (
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded border font-semibold tabular-nums shrink-0",
                fitColor(props.fitScore, props.evidenceBasis),
              )}
              title={fitConfidenceTooltip(props.fitScore, props.evidenceBasis)}
            >
              {props.fitScore}
            </span>
          )}
          <RightStamp
            daysInStage={props.daysInStage}
            matchedAt={props.matchedAt}
            isStale={props.isStale}
          />
        </div>

        {/* Row 2: signal */}
        {props.signal && (
          <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
            {props.signal}
          </div>
        )}

        {/* Row 3 (conditional): stepper | note snippet | pool badge */}
        {showStepper && (
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <CompactStepper progress={props.interviewProgress ?? []} />
          </div>
        )}
        {showNote && (
          <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground min-w-0">
            <MessageSquare className="h-3 w-3 shrink-0 text-muted-foreground/60" />
            <span className="truncate italic">&ldquo;{props.lastNotePreview}&rdquo;</span>
          </div>
        )}
        {showPool && (
          <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary">
              {props.recencyBadge === "new" && "✨ "}
              {props.recencyBadge === "re-engage" && "↩ "}
              {props.poolBadge}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Subcomponents ---------- */

function RightStamp({
  daysInStage,
  matchedAt,
  isStale,
}: {
  daysInStage?: number | null;
  matchedAt?: string;
  isStale?: boolean;
}) {
  if (isStale && daysInStage != null) {
    return (
      <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-amber-700 font-medium shrink-0">
        <Clock className="h-3 w-3" />
        {daysInStage}d stale
      </span>
    );
  }
  if (daysInStage != null) {
    return <span className="ml-auto text-[11px] text-muted-foreground tabular-nums shrink-0">{daysInStage}d</span>;
  }
  if (matchedAt) {
    return (
      <span className="ml-auto text-[11px] text-muted-foreground tabular-nums shrink-0">
        {relativeShort(matchedAt)}
      </span>
    );
  }
  return null;
}

function CompactStepper({ progress }: { progress: MatchCardInterviewProgress[] }) {
  // Cap at first 5 steps for the compact view; recruiter sees the full stepper in the right pane.
  const steps = progress.slice(0, 5);
  return (
    <div className="flex items-center shrink-0" title={steps.map((s) => s.stageName).join(" → ")}>
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        return (
          <div key={step.stageId} className="flex items-center">
            <Dot status={step.status} />
            {!isLast && <Bar status={step.status} />}
          </div>
        );
      })}
    </div>
  );
}

function Dot({ status }: { status: MatchCardInterviewProgress["status"] }) {
  if (status === "completed") {
    return (
      <span className="h-2 w-2 rounded-full bg-emerald-500 flex items-center justify-center">
        <Check className="h-1.5 w-1.5 text-white" strokeWidth={4} />
      </span>
    );
  }
  if (status === "proposed") {
    return <span className="h-2 w-2 rounded-full border-2 border-primary bg-primary/20 animate-pulse" />;
  }
  return <span className="h-2 w-2 rounded-full border border-border bg-background" />;
}

function Bar({ status }: { status: MatchCardInterviewProgress["status"] }) {
  return (
    <span
      className={cn(
        "h-px w-3 mx-0.5",
        status === "completed" ? "bg-emerald-500" : "bg-border",
      )}
    />
  );
}

/* ---------- Helpers ---------- */

function recommendationBadge(rec: string | null): { label: string; title: string; className: string } | null {
  switch (rec) {
    case "strong_yes":
      return { label: "Strong yes", title: "Strong yes", className: "bg-emerald-100 text-emerald-800" };
    case "yes":
      return { label: "Yes", title: "Yes", className: "bg-blue-100 text-blue-800" };
    case "maybe":
      return { label: "Maybe", title: "Maybe", className: "bg-amber-100 text-amber-800" };
    case "no":
      return { label: "No", title: "No", className: "bg-secondary text-secondary-foreground" };
    case "strong_no":
      return { label: "Strong no", title: "Strong no", className: "bg-red-100 text-red-800" };
    default:
      return null;
  }
}

function relativeShort(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    return diffHours <= 0 ? "now" : `${diffHours}h`;
  }
  if (diffDays === 1) return "1d";
  if (diffDays < 7) return `${diffDays}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
