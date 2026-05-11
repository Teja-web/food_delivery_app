"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { Check, Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { submitScorecard } from "@/actions/pipeline";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// -- Verdict config -------------------------------------------------

const VERDICT_OPTIONS = [
  { value: "strong_no", label: "Strong No", color: "text-red-600 bg-red-50 border-red-200", stars: 1 },
  { value: "no", label: "No", color: "text-red-500 bg-red-50/50 border-red-200/60", stars: 2 },
  { value: "neutral", label: "Neutral", color: "text-amber-700 bg-amber-50 border-amber-200", stars: 3 },
  { value: "yes", label: "Yes", color: "text-emerald-600 bg-emerald-50/50 border-emerald-200/60", stars: 4 },
  { value: "strong_yes", label: "Strong Yes", color: "text-emerald-700 bg-emerald-50 border-emerald-200", stars: 5 },
];

export function verdictToStars(verdict: string | null): number {
  return VERDICT_OPTIONS.find((o) => o.value === verdict)?.stars ?? 0;
}

// -- Types ----------------------------------------------------------

export interface ScorecardFormResult {
  id: string;
  reviewerId: string | null;
  reviewerName: string | null;
  overallRating: number | null;
  verdict: string | null;
  notes: string | null;
  ratings: { competency: string; rating: number; evidence: string }[];
  createdAt: string;
}

interface ScorecardFormProps {
  interviewId: string;
  competencies: string[];
  /** Pre-fill from existing partial ratings */
  existingRatings?: { competency: string; rating: number; evidence: string }[];
  /** Pre-fill verdict when editing */
  existingVerdict?: string | null;
  /** Pre-fill notes when editing */
  existingNotes?: string | null;
  /** Auto-save partial ratings on a 2s debounce */
  autoSave?: boolean;
  /** Require verdict before submit (detail page = true, room sidebar = false) */
  requireVerdict?: boolean;
  /** Callback after successful submit */
  onSubmitted?: (result: ScorecardFormResult) => void;
  /** Visual variant */
  variant?: "default" | "sidebar";
}

// -- Component ------------------------------------------------------

export function ScorecardForm({
  interviewId,
  competencies,
  existingRatings,
  existingVerdict,
  existingNotes,
  autoSave = false,
  requireVerdict = false,
  onSubmitted,
  variant = "default",
}: ScorecardFormProps) {
  const isSidebar = variant === "sidebar";
  const [isPending, startTransition] = useTransition();

  const [ratings, setRatings] = useState<Record<string, { rating: number; evidence: string }>>(
    () => {
      const initial: Record<string, { rating: number; evidence: string }> = {};
      for (const c of competencies) {
        const existing = existingRatings?.find((r) => r.competency === c);
        initial[c] = { rating: existing?.rating ?? 0, evidence: existing?.evidence ?? "" };
      }
      return initial;
    },
  );
  const [verdict, setVerdict] = useState(existingVerdict ?? "");
  const [notes, setNotes] = useState(existingNotes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const isEditing = !!(existingRatings?.length || existingVerdict);

  // Auto-save status (sidebar only)
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // -- Auto-save (debounced) ----------------------------------------
  useEffect(() => {
    if (!autoSave || submitted) return;

    const timeout = setTimeout(async () => {
      const entries = Object.entries(ratings)
        .filter(([, v]) => v.rating > 0 || v.evidence.trim())
        .map(([competency, v]) => ({ competency, rating: v.rating, evidence: v.evidence }));
      if (entries.length === 0) return;

      setSaving(true);
      try {
        await submitScorecard(interviewId, {
          ratings: entries,
          overallRating: null,
          verdict: null,
          notes: null,
        });
        setLastSaved(
          new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        );
      } catch {
        // Silent — user can retry via submit
      } finally {
        setSaving(false);
      }
    }, 2000);

    return () => clearTimeout(timeout);
  }, [autoSave, ratings, interviewId, submitted]);

  // -- Submit -------------------------------------------------------
  const handleSubmit = useCallback(() => {
    if (requireVerdict && !verdict) {
      setError("Select a verdict");
      return;
    }
    setError(null);

    const ratingsArray = Object.entries(ratings)
      .filter(([, v]) => v.rating > 0 || v.evidence.trim())
      .map(([competency, v]) => ({ competency, rating: v.rating, evidence: v.evidence }));

    startTransition(async () => {
      try {
        const derivedRating = verdict ? verdictToStars(verdict) : null;
        const result = await submitScorecard(interviewId, {
          ratings: ratingsArray,
          overallRating: derivedRating,
          verdict: verdict || null,
          notes: notes || null,
        });
        setSubmitted(true);
        onSubmitted?.({
          id: (result as any).id,
          reviewerId: (result as any).reviewerId ?? null,
          reviewerName: (result as any).reviewerName ?? null,
          overallRating: derivedRating,
          verdict: verdict || null,
          notes: notes || null,
          ratings: ratingsArray,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to submit scorecard");
      }
    });
  }, [ratings, verdict, notes, interviewId, requireVerdict, onSubmitted]);

  if (competencies.length === 0) {
    return (
      <p className={cn("text-sm italic", isSidebar ? "text-neutral-500" : "text-muted-foreground")}>
        No competencies defined for this interview stage.
      </p>
    );
  }

  // -- Shared style helpers -----------------------------------------
  const cardCls = isSidebar
    ? "rounded-lg border border-neutral-200 bg-white p-3 space-y-2"
    : "rounded-lg border border-border bg-background p-4 space-y-2.5";
  const labelCls = isSidebar
    ? "text-sm font-medium text-neutral-800"
    : "text-xs font-semibold text-foreground";
  const sectionLabelCls = isSidebar
    ? "text-xs font-bold uppercase tracking-wider text-neutral-500"
    : "text-xs font-bold uppercase tracking-widest text-muted-foreground";

  return (
    <div className="space-y-4">
      {/* Auto-save status */}
      {autoSave && (
        <div className="flex items-center justify-between">
          <p className={sectionLabelCls}>Scorecard</p>
          <p className="text-xs text-neutral-500">
            {saving ? "Saving..." : lastSaved ? `Saved ${lastSaved}` : ""}
          </p>
        </div>
      )}

      {/* Competency ratings */}
      {competencies.map((competency) => (
        <div key={competency} className={cardCls}>
          <div className={cn("flex items-center justify-between", !isSidebar && "")}>
            <p className={labelCls}>{competency}</p>
            {!isSidebar && (
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRatings((prev) => ({ ...prev, [competency]: { ...prev[competency], rating: n } }))}
                    disabled={submitted}
                    className="p-0.5 transition-colors disabled:opacity-50"
                  >
                    <Star className={cn("h-6 w-6", (ratings[competency]?.rating ?? 0) >= n ? "fill-amber-400 text-amber-400" : "text-neutral-300 hover:text-amber-300")} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Numbered dots for sidebar variant */}
          {isSidebar && (
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRatings((prev) => ({ ...prev, [competency]: { ...prev[competency], rating: n } }))}
                  disabled={submitted}
                  className={cn(
                    "inline-flex items-center justify-center h-7 w-7 rounded-full text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
                    (ratings[competency]?.rating ?? 0) >= n
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-200 text-neutral-500 hover:bg-neutral-300",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          )}

          {/* Evidence */}
          {isSidebar ? (
            <Textarea
              placeholder="Evidence / notes..."
              value={ratings[competency]?.evidence ?? ""}
              onChange={(e) => setRatings((prev) => ({ ...prev, [competency]: { ...prev[competency], evidence: e.target.value } }))}
              disabled={submitted}
              className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-sm text-neutral-700 placeholder:text-neutral-400 resize-none focus:outline-none focus:ring-1 focus:ring-neutral-300"
              rows={2}
            />
          ) : (
            <Input
              type="text"
              value={ratings[competency]?.evidence ?? ""}
              onChange={(e) => setRatings((prev) => ({ ...prev, [competency]: { ...prev[competency], evidence: e.target.value } }))}
              disabled={submitted}
              placeholder="Evidence / observations..."
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          )}
        </div>
      ))}

      {/* Verdict */}
      <div className={cardCls}>
        <p className={labelCls}>Verdict</p>
        <div className="flex gap-1.5">
          {isSidebar
            ? VERDICT_OPTIONS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => setVerdict(v.value)}
                  disabled={submitted}
                  className={cn(
                    "flex-1 rounded-md py-1.5 text-[10px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
                    verdict === v.value
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200",
                  )}
                >
                  {v.label}
                </button>
              ))
            : VERDICT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setVerdict(opt.value)}
                  disabled={submitted}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
                    verdict === opt.value ? opt.color : "border-border text-muted-foreground hover:border-foreground/30",
                  )}
                >
                  {opt.label}
                </button>
              ))}
        </div>
      </div>

      {/* Notes */}
      <div className={cardCls}>
        <p className={labelCls}>Notes</p>
        <Textarea
          placeholder="Overall observations, areas of strength, concerns..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={submitted}
          rows={isSidebar ? 3 : 4}
          className={cn(
            "w-full rounded-md border resize-none focus:outline-none focus:ring-1",
            isSidebar
              ? "border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-sm text-neutral-700 placeholder:text-neutral-400 focus:ring-neutral-300"
              : "border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:ring-primary",
          )}
        />
      </div>

      {/* Error */}
      {error && (
        <div className={cn(
          "rounded-lg px-3 py-2 text-xs",
          isSidebar ? "bg-red-50 border border-red-200 text-red-700" : "bg-red-50 border border-red-200 text-red-700",
        )}>
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending || submitted}
        className={cn(
          "inline-flex items-center justify-center gap-2 w-full rounded-lg py-2.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
          submitted
            ? "bg-emerald-500 text-white"
            : "bg-neutral-900 text-white hover:bg-neutral-800",
        )}
      >
        {isPending ? (
          isSidebar ? "Submitting..." : (
            <><Loader2 className="h-3 w-3 animate-spin" /> Submitting...</>
          )
        ) : submitted ? (
          isSidebar ? (isEditing ? "Scorecard Updated" : "Scorecard Submitted") : (
            <><Check className="h-3 w-3" /> {isEditing ? "Scorecard Updated" : "Scorecard Submitted"}</>
          )
        ) : isSidebar ? (
          isEditing ? "Update Scorecard" : "Submit Scorecard"
        ) : (
          <><Check className="h-3 w-3" /> {isEditing ? "Update Scorecard" : "Submit Scorecard"}</>
        )}
      </button>
    </div>
  );
}
