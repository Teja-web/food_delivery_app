"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Save,
  Sparkles,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchAssessment,
  fetchAssessmentAttempt,
  editAssessmentAttempt,
  listAssessmentQuestions,
} from "@/actions/assessments";
import { fetchCandidate } from "@/actions/candidates";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface Question {
  id: string;
  text: string;
  type: string;
  weight: number;
  options: string[] | null;
  correctAnswer: string | null;
  rubric: { label: string; weight: number }[] | null;
}

type Rating = "excellent" | "good" | "adequate" | "poor" | "missing";

const RATING_SCORES: Record<Rating, number> = {
  excellent: 100,
  good: 75,
  adequate: 50,
  poor: 25,
  missing: 0,
};

const RATING_LABELS: Record<Rating, string> = {
  excellent: "Excellent",
  good: "Good",
  adequate: "Adequate",
  poor: "Poor",
  missing: "Missing",
};

const RATING_COLORS: Record<Rating, string> = {
  excellent: "text-emerald-700 bg-emerald-50 border-emerald-200",
  good: "text-blue-700 bg-blue-50 border-blue-200",
  adequate: "text-amber-700 bg-amber-50 border-amber-200",
  poor: "text-red-700 bg-red-50 border-red-200",
  missing: "text-muted-foreground bg-secondary border-border",
};

interface Answer {
  questionId: string;
  value: string;
  score?: number;
  rating?: Rating;
  feedback?: string;
}

export default function AttemptDetailPage() {
  const router = useRouter();
  const params = useParams();
  const assessmentId = params.id as string;
  const attemptId = params.attemptId as string;

  const [assessment, setAssessment] = useState<{ id: string; title: string } | null>(null);
  const [candidate, setCandidate] = useState<{ id: string; name: string } | null>(null);
  const [attempt, setAttempt] = useState<{
    id: string;
    status: string;
    score: number | null;
    answers: Record<string, Answer>;
  } | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [scores, setScores] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [assessmentData, attemptData] = await Promise.all([
          fetchAssessment(assessmentId),
          fetchAssessmentAttempt(attemptId),
        ]);

        if (assessmentData) {
          setAssessment({ id: assessmentData.id, title: assessmentData.title });

          const questionsData = await listAssessmentQuestions(assessmentId);
          setQuestions(
            (questionsData as any[]).map((q) => ({
              id: q.id,
              text: q.text,
              type: q.type,
              weight: q.weight ?? 1,
              options: q.options as string[] | null,
              correctAnswer: q.correctAnswer as string | null,
              rubric: q.rubric as { label: string; weight: number }[] | null,
            }))
          );
        }

        if (attemptData) {
          // Handle both array format (from portal) and object format (legacy)
          let answers: Record<string, Answer> = {};
          const rawAnswers = attemptData.answers;
          if (Array.isArray(rawAnswers)) {
            // Convert array format to object format
            for (const ans of rawAnswers as Array<{ questionId: string; answer?: string; value?: string; score?: number; feedback?: string }>) {
              answers[ans.questionId] = {
                questionId: ans.questionId,
                value: ans.answer ?? ans.value ?? "",
                score: ans.score,
                feedback: ans.feedback,
              };
            }
          } else if (rawAnswers && typeof rawAnswers === "object") {
            // Handle both object format: {questionId: "string"} and {questionId: {value: "string"}}
            for (const [questionId, value] of Object.entries(rawAnswers)) {
              if (typeof value === "string") {
                answers[questionId] = { questionId, value };
              } else {
                answers[questionId] = value as Answer;
              }
            }
          }

          // Merge evaluation breakdown into answers
          const evaluation = attemptData.evaluation as {
            breakdown?: Array<{ questionId: string; score: number; feedback: string; rating?: Rating }>;
            [key: string]: unknown;
          } | null;
          if (evaluation?.breakdown) {
            for (const item of evaluation.breakdown) {
              if (answers[item.questionId]) {
                answers[item.questionId].score = item.score;
                answers[item.questionId].rating = item.rating;
                answers[item.questionId].feedback = item.feedback;
              } else {
                answers[item.questionId] = {
                  questionId: item.questionId,
                  value: "",
                  score: item.score,
                  rating: item.rating,
                  feedback: item.feedback,
                };
              }
            }
          }

          setAttempt({
            id: attemptData.id,
            status: attemptData.status,
            score: attemptData.score,
            answers,
          });

          // Initialize ratings, scores, and feedback from existing answers
          const initialRatings: Record<string, Rating> = {};
          const initialScores: Record<string, number> = {};
          const initialFeedback: Record<string, string> = {};
          for (const [qId, answer] of Object.entries(answers)) {
            if (answer.rating) initialRatings[qId] = answer.rating;
            if (answer.score !== undefined) initialScores[qId] = answer.score;
            if (answer.feedback) initialFeedback[qId] = answer.feedback;
          }
          setRatings(initialRatings);
          setScores(initialScores);
          setFeedback(initialFeedback);

          // Load candidate
          const candidateData = await fetchCandidate(attemptData.candidateId);
          if (candidateData) {
            setCandidate({ id: candidateData.id, name: candidateData.name });
          }
        }
      } catch (err) {
        console.error("Failed to load data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [assessmentId, attemptId]);

  const handleRatingChange = (questionId: string, rating: Rating) => {
    setRatings((prev) => ({ ...prev, [questionId]: rating }));
    setScores((prev) => ({ ...prev, [questionId]: RATING_SCORES[rating] }));
  };

  const handleFeedbackChange = (questionId: string, value: string) => {
    setFeedback((prev) => ({ ...prev, [questionId]: value }));
  };

  const calculateTotalScore = () => {
    let totalWeight = 0;
    let weightedScore = 0;

    for (const q of questions) {
      const score = scores[q.id];
      if (score !== undefined) {
        totalWeight += q.weight;
        weightedScore += score * q.weight;
      }
    }

    if (totalWeight === 0) return null;
    return Math.round(weightedScore / totalWeight);
  };

  const handleSave = async () => {
    if (!attempt) return;
    setSaving(true);

    try {
      // Update answers with ratings, scores, and feedback
      const updatedAnswers = { ...attempt.answers };
      for (const q of questions) {
        if (!updatedAnswers[q.id]) {
          updatedAnswers[q.id] = { questionId: q.id, value: "" };
        }
        if (ratings[q.id]) {
          updatedAnswers[q.id].rating = ratings[q.id];
          updatedAnswers[q.id].score = RATING_SCORES[ratings[q.id]];
        } else if (scores[q.id] !== undefined) {
          updatedAnswers[q.id].score = scores[q.id];
        }
        if (feedback[q.id]) {
          updatedAnswers[q.id].feedback = feedback[q.id];
        }
      }

      const totalScore = calculateTotalScore();
      const allScored = questions.every((q) => ratings[q.id] || scores[q.id] !== undefined);

      await editAssessmentAttempt(attemptId, {
        answers: updatedAnswers,
        score: totalScore,
        status: allScored ? "evaluated" : attempt.status,
        evaluatedAt: allScored ? new Date().toISOString() : undefined,
      });

      router.refresh();
      router.push(`/recruit/assessments/${assessmentId}`);
    } catch (err) {
      console.error("Failed to save evaluation:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!assessment || !attempt) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2">
        <p className="text-sm text-muted-foreground">Attempt not found</p>
        <Link href="/recruit/assessments" className="text-xs text-primary hover:underline">
          Back to assessments
        </Link>
      </div>
    );
  }

  const totalScore = calculateTotalScore();
  const isEvaluated = attempt.status === "evaluated";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="space-y-6">
          <Link
            href={`/recruit/assessments/${assessmentId}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to assessment
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                {isEvaluated ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Sparkles className="h-4 w-4" />}
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {isEvaluated ? "Results" : "Evaluate"}
                </span>
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                {assessment.title}
              </h1>
              {candidate && (
                <div className="mt-2 flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{candidate.name}</span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize",
                      attempt.status === "evaluated"
                        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                        : attempt.status === "submitted"
                        ? "text-amber-700 bg-amber-50 border-amber-200"
                        : "text-muted-foreground bg-secondary border-border"
                    )}
                  >
                    {attempt.status}
                  </span>
                </div>
              )}
            </div>
            <div className="text-right">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Total Score
              </p>
              <p className="text-3xl font-bold tabular-nums text-foreground">
                {totalScore !== null ? `${totalScore}%` : "-"}
              </p>
            </div>
          </div>

          {/* Questions */}
          <div className="space-y-3">
            {questions.map((q, idx) => {
              const answer = attempt.answers[q.id];
              const isExpanded = expandedQuestion === q.id;

              return (
                <div
                  key={q.id}
                  className="rounded-xl border border-border bg-card overflow-hidden"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="auto"
                    onClick={() => setExpandedQuestion(isExpanded ? null : q.id)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors whitespace-normal"
                  >
                    <span className="text-xs font-medium text-muted-foreground w-6 mt-0.5 shrink-0">
                      {idx + 1}.
                    </span>
                    <span className="flex-1 text-sm text-foreground break-words whitespace-normal">{q.text}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {ratings[q.id] && (
                        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize", RATING_COLORS[ratings[q.id]])}>
                          {RATING_LABELS[ratings[q.id]]}
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </Button>

                  {isExpanded && (
                    <div className="border-t border-border bg-secondary/20 px-4 py-4 space-y-4">
                      {/* Candidate's Answer */}
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                          Candidate's Answer
                        </p>
                        <div className="rounded-lg border border-border bg-background p-3">
                          <p className="text-sm text-foreground whitespace-pre-wrap">
                            {answer?.value || <span className="text-muted-foreground italic">No answer provided</span>}
                          </p>
                        </div>
                      </div>

                      {/* MCQ Correct Answer */}
                      {q.type === "MCQ" && q.correctAnswer && (
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          <span className="text-xs text-muted-foreground">
                            Correct answer: <span className="font-medium text-foreground">{q.correctAnswer}</span>
                          </span>
                        </div>
                      )}

                      {/* Rubric */}
                      {q.rubric && q.rubric.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                            Rubric
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {q.rubric.map((r, i) => (
                              <span
                                key={i}
                                className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground"
                              >
                                {r.label} ({r.weight}pt)
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Rating */}
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                          Rating
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {(Object.keys(RATING_LABELS) as Rating[]).filter(r => r !== "missing").map((r) => {
                            const isSelected = ratings[q.id] === r;
                            return (
                              <button
                                key={r}
                                type="button"
                                disabled={isEvaluated}
                                onClick={() => handleRatingChange(q.id, r)}
                                className={cn(
                                  "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
                                  isSelected
                                    ? RATING_COLORS[r]
                                    : "text-muted-foreground bg-background border-border hover:bg-secondary/50",
                                  isEvaluated && "cursor-default"
                                )}
                              >
                                {RATING_LABELS[r]}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Feedback */}
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                          Feedback
                        </p>
                        {isEvaluated ? (
                          <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
                            <p className="text-sm text-foreground whitespace-pre-wrap">
                              {feedback[q.id] || <span className="text-muted-foreground italic">No feedback</span>}
                            </p>
                          </div>
                        ) : (
                          <Textarea
                            rows={2}
                            value={feedback[q.id] ?? ""}
                            onChange={(e) => handleFeedbackChange(q.id, e.target.value)}
                            placeholder="Add feedback for this answer..."
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <Link
              href={`/recruit/assessments/${assessmentId}`}
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors"
            >
              {isEvaluated ? "Back" : "Cancel"}
            </Link>
            {!isEvaluated && (
              <Button
                onClick={handleSave}
                variant="default"
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-3 w-3" />
                    Save Evaluation
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
