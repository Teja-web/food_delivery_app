"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUp,
  Flag,
  Minus,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/* -- Types ------------------------------------------------------------ */

export interface MatchCardAlignment {
  criterion: string;
  rating: "strong" | "partial" | "gap";
  weight?: "critical" | "important" | "nice_to_have" | null;
  evidence?: string;
  sources?: ("resume" | "interview" | "assessment" | "talent_score")[];
}

export interface MatchCardInterviewProgress {
  stageId: string;
  stageName: string;
  order: number;
  status: "completed" | "proposed" | "pending";
  scheduledAt: string | null;
  verdict: string | null;
  interviewId: string | null;
}

export interface MatchCardEvidenceBasis {
  observed: number;
  paperOnly: number;
  total: number;
  confidence: "paper" | "partial" | "validated";
}

export interface MatchCardProps {
  /** Primary display name (candidate name or job title) */
  title: string;
  /** Optional link on the title */
  href?: string;
  /** Subtitle line (e.g. "Engineer at Acme" or "Engineering · San Francisco") */
  subtitle?: string;
  /** Extra metadata line (e.g. "Source: LinkedIn · Matched 3d ago") */
  meta?: string;

  fitScore: number | null;
  recommendation: string | null;
  alignment: MatchCardAlignment[];
  signal: string | null;
  gaps: string[];
  summary: string | null;

  /** Evidence confidence basis */
  evidenceBasis?: MatchCardEvidenceBasis;

  /** Pipeline stage badge */
  stage?: string;
  /** Days in current stage */
  daysInStage?: number | null;
  /** When added to pipeline */
  createdAt?: string;
  /** When matched */
  matchedAt?: string;

  /** Interview progress stepper */
  interviewProgress?: MatchCardInterviewProgress[];

  isPending: boolean;

  /** Compare/batch selection */
  selected?: boolean;
  onToggleSelect?: () => void;

  /** Actions footer — always visible below the card. Callers render their own buttons/banners. */
  children?: React.ReactNode;

  /** When true, drop the outer border/bg so the card sits flat inside an existing panel. */
  flat?: boolean;

  /** Right-aligned actions in the header. When provided in flat mode, replaces the expand toggle. */
  headerActions?: React.ReactNode;
}

/* -- Helpers ---------------------------------------------------------- */

/**
 * Fit-score badge palette is driven by *confidence* (how observed the score is),
 * not by the score's value. The number itself communicates fit; the hue
 * communicates trust:
 *   paper      — resume only, lowest trust          → muted slate
 *   partial    — some interview / assessment signal → amber
 *   validated  — ≥60% of criteria backed by interview/assessment → emerald
 *
 * `null` evidenceBasis (legacy / missing) falls back to the muted treatment.
 */
export function fitColor(_score: number, basis?: MatchCardEvidenceBasis): string {
  switch (basis?.confidence) {
    case "validated":
      return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "partial":
      return "text-amber-700 bg-amber-50 border-amber-200";
    case "paper":
    default:
      return "text-foreground/70 bg-secondary border-border";
  }
}

/** Human-readable explanation of why the score badge is colored the way it is. */
export function fitConfidenceTooltip(score: number, basis?: MatchCardEvidenceBasis): string {
  if (!basis || basis.total === 0) {
    return `Fit ${score} — no criteria evaluated yet`;
  }
  switch (basis.confidence) {
    case "validated":
      return `Fit ${score} — verified by interviews (${basis.observed} of ${basis.total} criteria backed)`;
    case "partial":
      return `Fit ${score} — partly verified (${basis.observed} of ${basis.total} criteria backed)`;
    case "paper":
    default:
      return `Fit ${score} — based on resume only, not yet verified by interviews`;
  }
}

function stageBadgeStyle(stage: string) {
  const styles: Record<string, string> = {
    offer: "text-emerald-700 bg-emerald-50 border-emerald-200",
    interview: "text-amber-700 bg-amber-50 border-amber-200",
    screening: "text-violet-700 bg-violet-50 border-violet-200",
    sourced: "text-muted-foreground bg-secondary border-border",
  };
  return styles[stage] || styles.sourced;
}

function relativeAge(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatRelativeDate(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((dDay.getTime() - nowDay.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* -- Component -------------------------------------------------------- */

export function MatchCard(props: MatchCardProps) {
  const [expanded, setExpanded] = useState(props.flat ?? false);
  const [showEvidence, setShowEvidence] = useState(false);

  const strongCount = props.alignment.filter((a) => a.rating === "strong").length;
  const totalCount = props.alignment.length;

  return (
    <div
      className={cn(
        "overflow-hidden transition-all",
        props.flat
          ? ""
          : cn(
              "rounded-xl border bg-card hover:shadow-sm",
              props.selected ? "border-primary ring-1 ring-primary/20" : "border-border",
            ),
        props.isPending && "opacity-50 pointer-events-none",
      )}
    >
      <div className="flex w-full items-center gap-4 px-5 py-4">
        {props.onToggleSelect && (
          <div
            role="checkbox"
            aria-checked={props.selected}
            onClick={() => props.onToggleSelect!()}
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors cursor-pointer",
              props.selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:border-foreground/50",
            )}
          >
            {props.selected && <Check className="h-3 w-3" />}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {props.href ? (
              <Link
                href={props.href}
                className="group/link inline-flex items-center gap-1 text-sm font-semibold text-foreground hover:underline"
              >
                {props.title}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover/link:translate-x-0.5" />
              </Link>
            ) : (
              <h3 className="text-sm font-semibold text-foreground">{props.title}</h3>
            )}
            {props.fitScore !== null && (
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums",
                  fitColor(props.fitScore, props.evidenceBasis),
                )}
                title={fitConfidenceTooltip(props.fitScore, props.evidenceBasis)}
              >
                {props.fitScore}
              </span>
            )}
            {props.stage && (
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize",
                  stageBadgeStyle(props.stage),
                )}
              >
                {props.stage}
              </span>
            )}
          </div>
          {props.subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{props.subtitle}</p>
          )}
          {props.meta && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{props.meta}</p>
          )}
          {props.signal && (
            <p className="mt-1 text-xs leading-relaxed text-foreground/70 line-clamp-1">
              {props.signal}
            </p>
          )}
        </div>
        {props.flat ? (
          props.headerActions && (
            <div className="flex items-center gap-2 shrink-0">{props.headerActions}</div>
          )
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className={cn("flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-secondary/60 transition-colors shrink-0", expanded && "bg-primary/10 border-primary/30")}
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition-transform",
                expanded && "rotate-180",
              )}
            />
          </button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-4">
          {/* Metrics row */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {props.daysInStage !== undefined && (
              <>
                <span>
                  <span className="font-semibold text-foreground">
                    {props.daysInStage ?? 0}d
                  </span>{" "}
                  in stage
                </span>
                <span className="text-border">|</span>
              </>
            )}
            {props.evidenceBasis ? (
              <span
                className={cn(
                  props.evidenceBasis.confidence === "paper" && "text-amber-600",
                )}
              >
                <span className="font-semibold text-foreground">
                  {props.evidenceBasis.observed}/{props.evidenceBasis.total}
                </span>{" "}
                {props.evidenceBasis.confidence === "paper"
                  ? "observed (paper only)"
                  : props.evidenceBasis.confidence === "partial"
                    ? "observed"
                    : "observed"}
              </span>
            ) : (
              <span>
                <span className="font-semibold text-foreground">
                  {totalCount > 0 ? `${strongCount}/${totalCount}` : "\u2014"}
                </span>{" "}
                evidence
              </span>
            )}
            {props.createdAt && (
              <>
                <span className="text-border">|</span>
                <span>
                  Added{" "}
                  <span className="font-semibold text-foreground">
                    {new Date(props.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </span>
              </>
            )}
            {props.matchedAt && !props.createdAt && (
              <>
                <span className="text-border">|</span>
                <span>
                  Matched{" "}
                  <span className="font-semibold text-foreground">
                    {relativeAge(props.matchedAt)}
                  </span>
                </span>
              </>
            )}
          </div>

          {/* Interview progress stepper */}
          {props.interviewProgress && props.interviewProgress.length > 0 && (() => {
            const completed = props.interviewProgress.filter((p) => p.status === "completed").length;
            const total = props.interviewProgress.length;
            return (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  Interviews ({completed}/{total})
                </p>
                <div className="flex items-start">
                  {props.interviewProgress.map((step, idx) => {
                    const isLast = idx === total - 1;
                    return (
                      <div
                        key={step.stageId}
                        className={cn(
                          "flex flex-col items-start",
                          isLast ? "shrink-0" : "flex-1 min-w-0",
                        )}
                      >
                        <span
                          className={cn(
                            "text-[10px] font-semibold leading-tight truncate max-w-full mb-1.5 pl-0",
                            step.status === "completed"
                              ? "text-foreground"
                              : step.status === "proposed"
                                ? "text-foreground"
                                : "text-muted-foreground/60",
                          )}
                        >
                          {step.stageName}
                        </span>
                        <div className="flex w-full items-center">
                          {step.status === "completed" ? (
                            <div className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                              <Check className="h-3 w-3" strokeWidth={3} />
                            </div>
                          ) : step.status === "proposed" ? (
                            <div className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary/10">
                              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                            </div>
                          ) : (
                            <div className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-border/80 bg-background" />
                          )}
                          {!isLast && (
                            <div className="relative h-[2px] flex-1 bg-border/40 mx-0.5 rounded-full overflow-hidden">
                              {step.status === "completed" && (
                                <div className="absolute inset-0 bg-emerald-400 rounded-full" />
                              )}
                            </div>
                          )}
                        </div>
                        <div className="mt-1 min-h-[14px]">
                          {step.scheduledAt && step.status === "proposed" && (
                            <span className="text-[9px] text-primary font-medium tabular-nums">
                              {formatRelativeDate(step.scheduledAt)}
                            </span>
                          )}
                          {step.verdict && (
                            <span
                              className={cn(
                                "inline-flex rounded-full border px-1.5 py-px text-[8px] font-bold uppercase tracking-wide leading-none",
                                step.verdict === "strong_yes" || step.verdict === "yes"
                                  ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                  : step.verdict === "neutral"
                                    ? "text-amber-700 bg-amber-50 border-amber-200"
                                    : "text-red-600 bg-red-50 border-red-200",
                              )}
                            >
                              {step.verdict.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Criteria alignment */}
          {props.alignment.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                Criteria alignment
              </p>
              <div className="flex flex-wrap gap-2">
                {props.alignment.map((c) => (
                  <span
                    key={c.criterion}
                    className={cn(
                      "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium",
                      c.rating === "strong"
                        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                        : c.rating === "partial"
                          ? "text-amber-700 bg-amber-50 border-amber-200"
                          : "text-red-600 bg-red-50 border-red-200",
                    )}
                  >
                    {c.weight === "critical" ? (
                      <ChevronsUp className="h-2.5 w-2.5 shrink-0" />
                    ) : c.weight === "important" ? (
                      <ChevronUp className="h-2.5 w-2.5 shrink-0" />
                    ) : (
                      <Minus className="h-2.5 w-2.5 shrink-0" />
                    )}
                    {c.criterion}
                    {c.sources && c.sources.length > 0 && (
                      <span className="ml-0.5 text-[8px] opacity-50" title={c.sources.join(", ")}>
                        {c.sources.map((s) => s === "interview" ? "I" : s === "assessment" ? "A" : s === "talent_score" ? "T" : "R").join("")}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Gaps */}
          {props.gaps.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50/50 px-3 py-2">
              <Flag className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
                  Gaps
                </p>
                <ul className="mt-0.5 space-y-0.5">
                  {props.gaps.map((gap, i) => (
                    <li key={i} className="text-xs leading-relaxed text-foreground">
                      {gap}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* AI Assessment */}
          {props.summary && (
            <div className="rounded-lg border border-amber-100 bg-amber-50/30 px-3 py-2.5">
              <div className="mb-1 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 shrink-0 text-amber-500" />
                <span className="text-[10px] font-semibold text-amber-900">Assessment</span>
                {props.recommendation && (
                  <span
                    className={cn(
                      "ml-auto rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase",
                      props.recommendation.includes("strong_yes")
                        ? "bg-emerald-100 text-emerald-700"
                        : props.recommendation === "yes"
                          ? "bg-emerald-50 text-emerald-600"
                          : props.recommendation === "maybe"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-50 text-red-600",
                    )}
                  >
                    {props.recommendation.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              <p className="text-xs leading-relaxed text-foreground">{props.summary}</p>
            </div>
          )}

          {/* Fallback if no summary but has recommendation */}
          {!props.summary && props.recommendation && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/30 px-3 py-2.5">
              <div className="mb-1 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 shrink-0 text-blue-500" />
                <span className="text-[10px] font-semibold text-blue-900">Recommendation</span>
              </div>
              <p className="text-xs leading-relaxed text-foreground capitalize">
                {props.recommendation.replace(/_/g, " ")}
              </p>
            </div>
          )}

          {/* Evidence details (collapsible) */}
          {props.alignment.some((a) => a.evidence) && (
            <>
              <Button
                variant="ghost"
                onClick={() => setShowEvidence(!showEvidence)}
                className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    showEvidence && "rotate-180",
                  )}
                />
                {showEvidence ? "Hide" : "Show"} evidence details
              </Button>
              {showEvidence && (
                <div className="border-t border-border/60 -mx-5 -mb-4 bg-secondary/10 px-5 py-4">
                  <div className="grid gap-2">
                    {props.alignment
                      .filter((a) => a.evidence)
                      .map((a) => {
                        const isInsufficient = a.evidence!.toLowerCase().includes("insufficient data");
                        return (
                          <div
                            key={a.criterion}
                            className={cn(
                              "flex items-start gap-3 rounded-lg border px-3 py-2.5",
                              a.rating === "strong"
                                ? "border-emerald-200/60 bg-emerald-50/30"
                                : a.rating === "partial"
                                  ? "border-amber-200/60 bg-amber-50/30"
                                  : "border-red-200/60 bg-red-50/30",
                            )}
                          >
                            <div
                              className={cn(
                                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded",
                                a.weight === "critical"
                                  ? "text-red-500"
                                  : a.weight === "important"
                                    ? "text-amber-500"
                                    : "text-muted-foreground/50",
                              )}
                              title={
                                a.weight === "critical"
                                  ? "Must have"
                                  : a.weight === "important"
                                    ? "Important"
                                    : "Nice to have"
                              }
                            >
                              {a.weight === "critical" ? (
                                <ChevronsUp className="h-3.5 w-3.5 shrink-0" />
                              ) : a.weight === "important" ? (
                                <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                              ) : (
                                <Minus className="h-3 w-3 shrink-0" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-semibold text-foreground">
                                {a.criterion}
                              </p>
                              <p
                                className={cn(
                                  "mt-0.5 text-xs leading-relaxed",
                                  isInsufficient
                                    ? "italic text-muted-foreground"
                                    : "text-foreground/80",
                                )}
                              >
                                {isInsufficient ? "No evidence found in resume" : a.evidence}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Empty state */}
          {props.alignment.length === 0 &&
            props.gaps.length === 0 &&
            !props.summary &&
            !props.recommendation && (
              <p className="text-xs text-muted-foreground">
                Match analysis is still being generated. Check back soon.
              </p>
            )}

        </div>
      )}

      {/* Actions footer — always visible */}
      {props.children && (
        <div className="border-t border-border px-5 py-3 space-y-3">
          {props.children}
        </div>
      )}
    </div>
  );
}
