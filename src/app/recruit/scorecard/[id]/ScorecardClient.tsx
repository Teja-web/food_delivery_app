"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Clock,
  Loader2,
  Send,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { submitScorecard } from "@/actions/pipeline";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

/* -- Types ---------------------------------------------------------- */

interface ScorecardRating {
  competency: string;
  rating: number;
  evidence: string;
}

interface ExistingScorecard {
  id: string;
  reviewerName: string | null;
  overallRating: number | null;
  verdict: string | null;
  notes: string | null;
  ratings: ScorecardRating[];
  createdAt: string;
}

interface ScorecardClientProps {
  interviewId: string;
  candidateName: string | null;
  roleName: string | null;
  interviewType: string | null;
  scheduledAt: string | null;
  durationMins: number;
  panelistNames: string[];
  evidenceTarget: string | null;
  competencies: string[];
  existingScorecards: ExistingScorecard[];
  status: string;
}

/* -- Constants ------------------------------------------------------ */

const RATINGS = ["Strong", "Meets", "Below", "Not assessed"] as const;
const RATING_VALUES: Record<string, number> = { Strong: 5, Meets: 3, Below: 1, "Not assessed": 0 };

const VERDICTS = [
  { value: "Strong advance", rating: 5 },
  { value: "Advance", rating: 4 },
  { value: "Hold", rating: 3 },
  { value: "No advance", rating: 1 },
] as const;

/* -- Helpers -------------------------------------------------------- */

function ratingColor(rating: string) {
  switch (rating) {
    case "Strong": return "border-emerald-300 bg-emerald-50 text-emerald-700";
    case "Meets": return "border-amber-300 bg-amber-50 text-amber-700";
    case "Below": return "border-red-300 bg-red-50 text-red-700";
    default: return "border-border bg-secondary text-muted-foreground";
  }
}

function verdictColor(v: string) {
  if (v.includes("Strong") || v === "Advance") return "border-emerald-300 bg-emerald-50 text-emerald-700";
  if (v === "Hold") return "border-amber-300 bg-amber-50 text-amber-700";
  return "border-red-300 bg-red-50 text-red-700";
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/* -- Component ------------------------------------------------------ */

export default function ScorecardClient(props: ScorecardClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [ratings, setRatings] = useState<Record<string, { label: string; evidence: string }>>(
    () => Object.fromEntries(props.competencies.map((c) => [c, { label: "", evidence: "" }])),
  );
  const [verdict, setVerdict] = useState("");
  const [summaryNotes, setSummaryNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const alreadySubmitted = props.existingScorecards.length > 0 || props.status === "completed";

  const handleSubmit = () => {
    if (!verdict) {
      setError("Select an overall recommendation");
      return;
    }
    setError(null);

    const ratingsArray = Object.entries(ratings)
      .filter(([, v]) => v.label && v.label !== "Not assessed")
      .map(([competency, v]) => ({
        competency,
        rating: RATING_VALUES[v.label] ?? 0,
        evidence: v.evidence,
      }));

    const overallRating = VERDICTS.find((v) => v.value === verdict)?.rating ?? 3;

    startTransition(async () => {
      try {
        await submitScorecard(props.interviewId, {
          ratings: ratingsArray,
          overallRating,
          verdict,
          notes: summaryNotes || undefined,
        });
        setSubmitted(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to submit scorecard");
      }
    });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="space-y-8">
          <Link href={`/recruit/interviews/${props.interviewId}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3 w-3" />
            Back to interview
          </Link>

          {/* Header */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-6 py-5">
              <div className="flex items-center gap-2 mb-1">
                {alreadySubmitted || submitted ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs font-semibold text-emerald-700">Scorecard submitted</span>
                  </>
                ) : (
                  <>
                    <Clock className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-semibold text-amber-700">Scorecard pending</span>
                  </>
                )}
              </div>
              <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
                {props.candidateName ?? "Candidate"} — {props.interviewType?.replace(/_/g, " ") ?? "Interview"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {props.roleName ?? ""}{props.scheduledAt ? ` \u00B7 ${formatDateTime(props.scheduledAt)}` : ""} &middot; {props.durationMins} min
                {props.panelistNames.length > 0 ? ` \u00B7 with ${props.panelistNames.join(", ")}` : ""}
              </p>
            </div>
            {props.evidenceTarget && (
              <div className="border-t border-border px-6 py-3 bg-secondary/30">
                <p className="text-[11px] text-muted-foreground"><span className="font-semibold text-foreground">Evidence targets for this interview:</span> {props.evidenceTarget}</p>
              </div>
            )}
          </div>

          {/* Already submitted — show existing scorecards */}
          {(alreadySubmitted || submitted) && props.existingScorecards.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Submitted scorecards</h2>
              {props.existingScorecards.map((sc) => (
                <div key={sc.id} className="rounded-xl border border-border bg-card p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">{sc.reviewerName ?? "Reviewer"}</p>
                    {sc.verdict && (
                      <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[10px] font-semibold capitalize">{sc.verdict}</span>
                    )}
                  </div>
                  {sc.ratings.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {sc.ratings.map((r) => (
                        <span key={r.competency} className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2.5 py-0.5 text-[10px] font-medium text-foreground">
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
                  {sc.notes && <p className="text-xs leading-relaxed text-muted-foreground">{sc.notes}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Scorecard form — only show if not yet submitted */}
          {!alreadySubmitted && !submitted && (
            <>
              {/* Competency ratings */}
              {props.competencies.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-foreground">Rate each competency</h2>
                  {props.competencies.map((comp) => (
                    <div key={comp} className="rounded-xl border border-border bg-card p-5">
                      <div className="mb-3">
                        <p className="text-sm font-semibold text-foreground">{comp}</p>
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                        {RATINGS.map((rating) => (
                          <Button
                            variant="unstyled"
                            key={rating}
                            onClick={() => setRatings((prev) => ({ ...prev, [comp]: { ...prev[comp], label: rating } }))}
                            className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium transition-all", ratings[comp]?.label === rating ? ratingColor(rating) : "border-border bg-background text-muted-foreground hover:bg-secondary")}
                          >
                            {rating}
                          </Button>
                        ))}
                      </div>
                      <Textarea
                        rows={2}
                        value={ratings[comp]?.evidence ?? ""}
                        onChange={(e) => setRatings((prev) => ({ ...prev, [comp]: { ...prev[comp], evidence: e.target.value } }))}
                        placeholder="What specific evidence did you observe? Include examples from the conversation."
                        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* No competencies fallback */}
              {props.competencies.length === 0 && (
                <div className="rounded-xl border border-dashed border-border bg-card/50 p-5 text-center">
                  <p className="text-xs text-muted-foreground">No competencies defined for this interview stage. You can still submit an overall recommendation below.</p>
                </div>
              )}

              {/* Overall recommendation */}
              <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                <h2 className="text-sm font-semibold text-foreground">Overall recommendation</h2>
                <div className="flex items-center gap-2">
                  {VERDICTS.map((v) => (
                    <Button
                      variant="unstyled"
                      key={v.value}
                      onClick={() => setVerdict(v.value)}
                      className={cn("rounded-lg border px-4 py-2 text-xs font-medium transition-all", verdict === v.value ? verdictColor(v.value) : "border-border bg-background text-muted-foreground hover:bg-secondary")}
                    >
                      {v.value}
                    </Button>
                  ))}
                </div>
                <Textarea
                  rows={3}
                  value={summaryNotes}
                  onChange={(e) => setSummaryNotes(e.target.value)}
                  placeholder="Summarize your overall impression. What stood out? What concerns remain?"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              {/* Pre-submit note */}
              <div className="rounded-xl border border-dashed border-border bg-card/50 p-5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-[8px]">&#10022;</div>
                  <p className="text-xs font-semibold text-foreground">Before you submit</p>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Your scorecard is visible to the hiring team and feeds into the candidate&apos;s evidence profile.
                  Focus on specific observations, not general impressions.
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end pt-4 border-t border-border">
                <Button
                  variant="default"
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-3 w-3" />
                      Submit scorecard
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
