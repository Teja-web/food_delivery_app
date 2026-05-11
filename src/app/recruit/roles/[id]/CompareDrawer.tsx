"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  X,
  Loader2,
  Brain,
  CheckCircle,
  AlertCircle,
  MinusCircle,
  GitCompare,
  Star,
  ChevronsUp,
  ChevronUp,
  Minus,
  Sparkles,
  CircleX,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { compareCandidates } from "@/actions/compare";
import type { SerializedApplication, SerializedAlignment } from "./serialize";
import { Button } from "@/components/ui/button";

type ComparisonResult = Awaited<ReturnType<typeof compareCandidates>>;

interface CompareDrawerProps {
  roleId: string;
  roleTitle: string;
  candidates: SerializedApplication[];
  onClose: () => void;
}

/* -- Helpers ----------------------------------------------------------- */

const RATING_CONFIG = {
  strong: { icon: CheckCircle, color: "text-emerald-600", label: "Strong" },
  partial: { icon: MinusCircle, color: "text-amber-600", label: "Partial" },
  gap: { icon: CircleX, color: "text-red-400", label: "Gap" },
} as const;

function RatingCell({ rating, isBest }: { rating: string; isBest: boolean }) {
  const config = RATING_CONFIG[rating as keyof typeof RATING_CONFIG] ?? RATING_CONFIG.gap;
  const Icon = config.icon;
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5">
      <Icon className={cn("h-3.5 w-3.5 shrink-0", config.color)} />
      <span className={cn("text-[11px] font-medium", config.color)}>{config.label}</span>
      {isBest && <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />}
    </div>
  );
}

function WeightIcon({ weight }: { weight: string | null }) {
  if (weight === "critical") return <ChevronsUp className="h-3 w-3 text-red-500 shrink-0" />;
  if (weight === "important") return <ChevronUp className="h-3 w-3 text-amber-500 shrink-0" />;
  return <Minus className="h-3 w-3 text-muted-foreground/40 shrink-0" />;
}

/** Derive "best for criterion" from existing alignment data — no AI needed */
function deriveBestForCriterion(candidates: SerializedApplication[], criterion: string): string | null {
  const ratingScore = { strong: 3, partial: 2, gap: 1 };
  let bestId: string | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const a = c.alignment.find((al) => al.criterion === criterion);
    const score = ratingScore[a?.rating as keyof typeof ratingScore] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestId = c.candidateId;
    }
  }
  // Only mark a best if not all tied
  const allSame = candidates.every((c) => {
    const a = c.alignment.find((al) => al.criterion === criterion);
    const score = ratingScore[a?.rating as keyof typeof ratingScore] ?? 0;
    return score === bestScore;
  });
  return allSame ? null : bestId;
}

/* -- Main Component ---------------------------------------------------- */

export function CompareDrawer({ roleId, roleTitle, candidates, onClose }: CompareDrawerProps) {
  const [analysis, setAnalysis] = useState<ComparisonResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Run AI analysis in background
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIsAnalyzing(true);
      setError(null);
      try {
        const result = await compareCandidates(
          roleId,
          candidates.map((c) => ({
            candidateId: c.candidateId,
            name: c.candidateName,
            fitScore: c.fitScore,
            alignment: c.alignment.map((a) => ({
              criterion: a.criterion,
              rating: a.rating,
              weight: a.weight,
              evidence: a.evidence,
            })),
            signal: c.signal,
            gaps: c.gaps,
            summary: c.summary,
            recommendation: c.recommendation,
          })),
        );
        if (!cancelled) setAnalysis(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Analysis failed");
      } finally {
        if (!cancelled) setIsAnalyzing(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [roleId, candidates.map((c) => c.candidateId).join(","), retryCount]);

  // Derive data from existing evaluations — available instantly
  const candidatesByFitScore = useMemo(
    () => [...candidates].sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0)),
    [candidates],
  );

  const allCriteria = useMemo(() => [...new Map(
    candidates.flatMap((c) => c.alignment).map((a) => [a.criterion, a]),
  ).values()], [candidates]);

  const criteriaGroups = useMemo(() => [
    { title: "Critical", items: allCriteria.filter((a) => a.weight === "critical") },
    { title: "Important", items: allCriteria.filter((a) => a.weight === "important") },
    { title: "Nice to Have", items: allCriteria.filter((a) => a.weight === "nice_to_have" || !a.weight) },
  ].filter((g) => g.items.length > 0), [allCriteria]);

  // Use AI-derived best when available, otherwise derive from existing data
  const getBestForCriterion = useCallback((criterion: string): string | null => {
    if (analysis) {
      return analysis.criteriaComparison.find((c) => c.criterion === criterion)?.bestCandidateId ?? null;
    }
    return deriveBestForCriterion(candidates, criterion);
  }, [analysis, candidates]);

  const colCount = candidates.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="fixed inset-3 sm:inset-6 bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* -- Header ------------------------------------------------ */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <GitCompare className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground truncate">Compare Candidates</h2>
              <p className="text-xs text-muted-foreground truncate">{candidates.length} candidates for {roleTitle}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close comparison"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* -- Content — always visible, AI enriches progressively -- */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-8">
            <div className="overflow-x-auto">
              <div style={{ minWidth: colCount > 2 ? `${180 + colCount * 200}px` : undefined }}>

                {/* Column headers — candidate names */}
                <div
                  className="grid gap-3 mb-4"
                  style={{ gridTemplateColumns: `180px repeat(${colCount}, 1fr)` }}
                >
                  <div />
                  {candidates.map((c) => (
                    <div key={c.candidateId} className="min-w-0 px-2.5">
                      <Link
                        href={`/recruit/candidates/${c.candidateId}`}
                        className="text-xs font-semibold text-foreground hover:underline truncate block"
                      >
                        {c.candidateName}
                      </Link>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {c.candidateTitle || "No title"}{c.candidateCompany ? ` at ${c.candidateCompany}` : ""}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Rankings — AI-enriched or fit-score fallback */}
                <section className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Rankings</h3>
                    {isAnalyzing && (
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground ml-auto">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        AI analysis loading...
                      </div>
                    )}
                  </div>
                  <div
                    className="grid gap-3"
                    style={{ gridTemplateColumns: `180px repeat(${colCount}, 1fr)` }}
                  >
                    <div />
                    {candidates.map((c) => {
                      const aiRanking = analysis?.rankings.find((r) => r.candidateId === c.candidateId);
                      const score = aiRanking?.score ?? c.fitScore ?? 0;
                      const rank = aiRanking?.rank ?? (candidatesByFitScore.indexOf(c) + 1);
                      const isBest = rank === 1;
                      return (
                        <div
                          key={c.candidateId}
                          className={cn(
                            "rounded-xl border p-4 space-y-3",
                            isBest ? "border-primary/40 bg-primary/[0.03] shadow-sm" : "border-border",
                          )}
                        >
                          {/* Rank badge + score */}
                          <div className="flex items-center justify-between">
                            <div className={cn(
                              "h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                              rank === 1 ? "bg-amber-400 text-white"
                                : rank === 2 ? "bg-zinc-300 text-zinc-700"
                                : "bg-muted text-muted-foreground",
                            )}>
                              #{rank}
                            </div>
                            <span className="text-sm font-bold tabular-nums text-foreground">{score}</span>
                          </div>

                          {/* Score bar */}
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                score >= 70 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-400",
                              )}
                              style={{ width: `${score}%` }}
                            />
                          </div>

                          {/* AI strengths & concerns (appear when loaded) */}
                          {aiRanking && (
                            <div className="space-y-2">
                              {aiRanking.strengths.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Strengths</p>
                                  {aiRanking.strengths.map((s, i) => (
                                    <p key={i} className="text-[11px] text-muted-foreground leading-relaxed">- {s}</p>
                                  ))}
                                </div>
                              )}
                              {aiRanking.concerns.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-red-500">Concerns</p>
                                  {aiRanking.concerns.map((c2, i) => (
                                    <p key={i} className="text-[11px] text-muted-foreground leading-relaxed">- {c2}</p>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Fallback: show signal while AI loads */}
                          {!aiRanking && c.signal && (
                            <p className="text-[11px] text-muted-foreground leading-relaxed">{c.signal}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Criteria Matrix — instant from existing data */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Criteria Comparison</h3>
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground mb-4 pb-3 border-b border-border">
                    {Object.values(RATING_CONFIG).map((config) => {
                      const Icon = config.icon;
                      return (
                        <span key={config.label} className="flex items-center gap-1">
                          <Icon className={cn("h-3 w-3", config.color)} />
                          {config.label}
                        </span>
                      );
                    })}
                    <span className="text-border">|</span>
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                      Best for criterion
                    </span>
                    <span className="text-border">|</span>
                    <span className="flex items-center gap-1"><ChevronsUp className="h-3 w-3 text-red-500" /> Critical</span>
                    <span className="flex items-center gap-1"><ChevronUp className="h-3 w-3 text-amber-500" /> Important</span>
                  </div>

                  {/* Criteria groups */}
                  {criteriaGroups.map((group) => (
                    <div key={group.title} className="mb-4">
                      <div className="flex items-center gap-2 py-2 mb-1">
                        <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{group.title}</h4>
                        <span className="rounded-full bg-secondary px-1.5 py-0 text-[10px] font-medium text-muted-foreground">{group.items.length}</span>
                      </div>
                      {group.items.map((criterion) => {
                        const bestId = getBestForCriterion(criterion.criterion);
                        return (
                          <div
                            key={criterion.criterion}
                            className="grid gap-3 py-2 border-b border-dashed border-border/50 last:border-0"
                            style={{ gridTemplateColumns: `180px repeat(${colCount}, 1fr)` }}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <WeightIcon weight={criterion.weight} />
                              <span className="text-xs font-medium text-foreground truncate" title={criterion.criterion}>{criterion.criterion}</span>
                            </div>
                            {candidates.map((candidate) => {
                              const a = candidate.alignment.find((al) => al.criterion === criterion.criterion);
                              const rating = a?.rating ?? "gap";
                              const isBest = bestId === candidate.candidateId;
                              return <RatingCell key={candidate.candidateId} rating={rating} isBest={isBest} />;
                            })}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </section>

              </div>
            </div>
          </div>
        </div>

        {/* -- AI Recommendation footer — loads async --------------- */}
        <div className="border-t border-border px-6 py-4 bg-muted/20 shrink-0">
          <div className="flex items-start gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
              <Brain className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground mb-1">AI Recommendation</p>
              {analysis ? (
                <p className="text-xs leading-relaxed text-muted-foreground">{analysis.recommendation}</p>
              ) : error ? (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-red-500">Failed to generate recommendation</p>
                  <Button
                    variant="link"
                    onClick={() => setRetryCount((c) => c + 1)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium"
                  >
                    <Sparkles className="h-3 w-3" />
                    Retry
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Generating recommendation...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
