import { fetchPortalAssessmentResults } from "@/actions/portal";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle, MessageSquare, Award } from "lucide-react";

type Rating = "excellent" | "good" | "adequate" | "poor" | "missing";

const RATING_LABELS: Record<Rating, string> = {
  excellent: "Excellent",
  good: "Good",
  adequate: "Adequate",
  poor: "Poor",
  missing: "Missing",
};

const RATING_COLORS: Record<Rating, string> = {
  excellent: "bg-emerald-100 text-emerald-700",
  good: "bg-blue-100 text-blue-700",
  adequate: "bg-amber-100 text-amber-700",
  poor: "bg-red-100 text-red-700",
  missing: "bg-secondary text-muted-foreground",
};

interface Answer {
  questionId: string;
  answer?: string;
  value?: string;
  score?: number;
  rating?: Rating;
  feedback?: string;
}

export default async function AssessmentResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let attempt: any;
  let questions: any[] = [];
  try {
    const result = await fetchPortalAssessmentResults(id);
    attempt = result.attempt;
    questions = result.questions;
  } catch {
    redirect("/assessments");
  }

  if (!attempt) {
    redirect("/assessments");
  }

  if (attempt.status !== "submitted" && attempt.status !== "completed" && attempt.status !== "evaluated") {
    redirect("/assessments");
  }

  const evaluation = attempt.evaluation as {
    feedback?: string;
    summary?: string;
    breakdown?: Array<{ questionId: string; score: number; feedback: string; rating?: Rating }>;
    [key: string]: unknown;
  } | null;
  const assessmentTitle = (attempt.assessment as any)?.title ?? "Assessment";
  const submittedAt = attempt.submittedAt
    ? new Date(attempt.submittedAt).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : null;

  let answersMap: Record<string, Answer> = {};
  const rawAnswers = attempt.answers;
  if (Array.isArray(rawAnswers)) {
    for (const ans of rawAnswers as Answer[]) {
      answersMap[ans.questionId] = ans;
    }
  } else if (rawAnswers && typeof rawAnswers === "object") {
    for (const [questionId, value] of Object.entries(rawAnswers)) {
      if (typeof value === "string") {
        answersMap[questionId] = { questionId, answer: value };
      } else {
        answersMap[questionId] = value as Answer;
      }
    }
  }

  if (evaluation?.breakdown) {
    for (const item of evaluation.breakdown) {
      if (answersMap[item.questionId]) {
        answersMap[item.questionId].score = item.score;
        answersMap[item.questionId].rating = item.rating;
        answersMap[item.questionId].feedback = item.feedback;
      } else {
        answersMap[item.questionId] = {
          questionId: item.questionId,
          score: item.score,
          rating: item.rating,
          feedback: item.feedback,
        };
      }
    }
  }

  const isEvaluated = attempt.status === "evaluated";
  const totalScore = attempt.score;

  const answeredCount = questions.filter((q) => {
    const ans = answersMap[q.id];
    return ans && (ans.answer || ans.value);
  }).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="space-y-6">
          <Link
            href="/assessments"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Assessments
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                {assessmentTitle}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {isEvaluated
                  ? `Results ready${submittedAt ? ` — submitted ${submittedAt}` : ""}`
                  : attempt.status === "completed"
                    ? `Submitted${submittedAt ? ` on ${submittedAt}` : ""} — evaluation in progress`
                    : `Submitted${submittedAt ? ` on ${submittedAt}` : ""} — awaiting evaluation`}
              </p>
            </div>
            {isEvaluated && totalScore !== null && (
              <div className="text-right shrink-0">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Total Score
                </p>
                <p className="text-3xl font-bold tabular-nums text-foreground">
                  {totalScore}%
                </p>
              </div>
            )}
          </div>

          {isEvaluated ? (
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Assessment Complete</p>
                  <p className="text-sm text-muted-foreground">
                    {answeredCount} of {questions.length} questions answered
                  </p>
                </div>
              </div>
              {(evaluation?.feedback || evaluation?.summary) && (
                <div className="mt-4 rounded-xl bg-secondary/50 p-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Overall Feedback
                  </p>
                  <p className="text-sm text-foreground">{evaluation.feedback || evaluation.summary}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
              <div className="mx-auto">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground" />
                </div>
                <p className="mt-4 text-sm font-semibold text-foreground">
                  Evaluating your responses
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Our AI is analyzing your answers. Results typically appear within minutes.
                </p>
              </div>
            </div>
          )}

          {isEvaluated && questions.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Your Responses</h2>
              <div className="space-y-3">
                {questions.map((q, idx) => {
                  const answer = answersMap[q.id];
                  const answerText = answer?.answer || answer?.value || "";
                  const score = answer?.score;
                  const feedback = answer?.feedback;

                  return (
                    <div
                      key={q.id}
                      className="rounded-xl border border-border bg-card overflow-hidden"
                    >
                      <div className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <span className="text-xs font-medium text-muted-foreground w-6 mt-0.5 shrink-0">
                            {idx + 1}.
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{q.text}</p>
                            {answerText && (
                              <div className="mt-2 rounded-lg bg-secondary/50 px-3 py-2">
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                  {answerText}
                                </p>
                              </div>
                            )}
                            {!answerText && (
                              <p className="mt-2 text-sm text-muted-foreground italic">
                                No answer provided
                              </p>
                            )}
                          </div>
                          {answer?.rating && (
                            <div className="shrink-0 text-right">
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${RATING_COLORS[answer.rating]}`}
                              >
                                {RATING_LABELS[answer.rating]}
                              </span>
                            </div>
                          )}
                        </div>
                        {feedback && (
                          <div className="mt-3 ml-9 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                            <MessageSquare className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                            <p className="text-xs text-foreground">{feedback}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isEvaluated && (
            <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-card/50 p-5">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-[10px]">
                <Award className="h-3.5 w-3.5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Keep up the great work!
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Review your feedback to identify areas for improvement. You can take more
                  practice assessments to sharpen your skills.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
