"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Send } from "lucide-react";
import { submitPortalPracticeAnswers, savePortalAssessmentDraft } from "@/actions/portal";
import { renderQuestion, type Question } from "@/components/assessments/QuestionRenderers";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";

/* -- Types --------------------------------------------------- */

interface AssessmentTakeClientProps {
  attemptId: string;
  title: string;
  type: string;
  description: string | null;
  questions: Question[];
  existingAnswers: Record<string, string>;
}

/* -- Main Component ------------------------------------------- */

export function AssessmentTakeClient({
  attemptId,
  title,
  type,
  description,
  questions,
  existingAnswers,
}: AssessmentTakeClientProps) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(existingAnswers);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const sortedQuestions = [...questions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const currentQuestion = sortedQuestions[currentIndex];
  const totalQuestions = sortedQuestions.length;
  const answeredCount = Object.keys(answers).filter((k) => answers[k]?.trim()).length;

  // Auto-save answers when they change
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      savePortalAssessmentDraft(attemptId, answers).catch(console.error);
    }, 1000); // Debounce for 1 second

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [answers, attemptId]);

  const setAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = () => {
    setError(null);
    startTransition(async () => {
      try {
        // Save answers as object, not array, to match the expected format
        await submitPortalPracticeAnswers(attemptId, answers);
        router.push(`/assessments/${attemptId}/results`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to submit");
      }
    });
  };

  if (totalQuestions === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <Link
            href="/assessments"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to assessments
          </Link>
          <div className="mt-8 rounded-lg border bg-card p-8 text-center">
            <p className="text-muted-foreground">No questions found for this assessment.</p>
          </div>
        </div>
      </div>
    );
  }

  const renderQ = (q: Question) => {
    const value = answers[q.id] ?? "";
    const onChange = (v: string) => setAnswer(q.id, v);
    return renderQuestion(q, value, onChange);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 space-y-3">
          <Link
            href="/assessments"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Assessments
          </Link>

          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              {type && (
                <p className="mt-0.5 text-xs text-muted-foreground capitalize">
                  {type.replace(/_/g, " ")}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                {answeredCount} of {totalQuestions} answered
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
            />
          </div>
        </div>

        {description?.trim() && (
          <div className="mb-6 rounded-xl border border-border bg-secondary/30 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Problem statement
            </p>
            <Streamdown
              className="prose prose-sm max-w-none prose-p:my-1 prose-p:text-foreground prose-strong:text-foreground prose-pre:my-2 prose-pre:bg-neutral-900 prose-pre:text-neutral-100 prose-pre:rounded-lg prose-pre:p-4 [&_code:not(pre_code)]:text-[13px] [&_code:not(pre_code)]:text-pink-700 [&_code:not(pre_code)]:bg-pink-50 [&_code:not(pre_code)]:border [&_code:not(pre_code)]:border-pink-200 [&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:px-1.5 [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:font-semibold [&_code:not(pre_code)]:font-mono dark:[&_code:not(pre_code)]:text-pink-300 dark:[&_code:not(pre_code)]:bg-pink-950/60 dark:[&_code:not(pre_code)]:border-pink-700 text-foreground leading-relaxed"
              controls={{ code: false }}
            >
              {description}
            </Streamdown>
          </div>
        )}

        {/* Question Card */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4">
            <span className="text-xs font-medium text-muted-foreground">
              Question {currentIndex + 1} of {totalQuestions}
            </span>
            <Streamdown
              className="mt-2 prose prose-sm max-w-none prose-p:my-1 prose-p:text-foreground prose-strong:text-foreground prose-pre:my-2 prose-pre:bg-neutral-900 prose-pre:text-neutral-100 prose-pre:rounded-lg prose-pre:p-4 [&_code:not(pre_code)]:text-[13px] [&_code:not(pre_code)]:text-pink-700 [&_code:not(pre_code)]:bg-pink-50 [&_code:not(pre_code)]:border [&_code:not(pre_code)]:border-pink-200 [&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:px-1.5 [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:font-semibold [&_code:not(pre_code)]:font-mono dark:[&_code:not(pre_code)]:text-pink-300 dark:[&_code:not(pre_code)]:bg-pink-950/60 dark:[&_code:not(pre_code)]:border-pink-700 text-foreground leading-relaxed"
              controls={{ code: false }}
            >
              {currentQuestion?.text ?? ""}
            </Streamdown>
          </div>

          <div className="mt-6" key={currentQuestion?.id}>
            {currentQuestion && renderQ(currentQuestion)}
          </div>
        </div>

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="soft"
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium hover:text-foreground hover:border-foreground/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </Button>

          <div className="flex items-center gap-2">
            {/* Question dots */}
            <div className="flex gap-1">
              {sortedQuestions.map((q, idx) => (
                <Button
                  key={q.id}
                  variant="unstyled"
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    idx === currentIndex
                      ? "bg-primary"
                      : answers[q.id]?.trim()
                      ? "bg-primary/40"
                      : "bg-muted-foreground/20"
                  }`}
                />
              ))}
            </div>
          </div>

          {currentIndex < totalQuestions - 1 ? (
            <Button
              variant="default"
              onClick={() => setCurrentIndex((i) => Math.min(totalQuestions - 1, i + 1))}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              variant="default"
              onClick={handleSubmit}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Submit
                </>
              )}
            </Button>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
