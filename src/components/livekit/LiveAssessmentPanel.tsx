"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ChevronLeft, ChevronRight, Send, Loader2, CheckCircle2 } from "lucide-react";
import { renderQuestion, type Question } from "@/components/assessments/QuestionRenderers";
import { CodeEditor } from "@/components/assessments/CodeEditor";
import { Streamdown } from "streamdown";
import { AssessmentTimer } from "./AssessmentTimer";
import { LiveKitYjsProvider } from "@/lib/yjs-livekit-provider";
import * as Y from "yjs";
import type { Room } from "livekit-client";
import { Button } from "@/components/ui/button";

/* -- Types --------------------------------------------------- */

export interface AssessmentMirrorState {
  questionIndex: number;
  answers: Record<string, string>;
  status: string;
}

interface BaseProps {
  attemptId: string;
  title: string;
  questions: Question[];
  deadlineAt: string | null;
  room: Room;
}

interface InteractiveProps extends BaseProps {
  readOnly?: false;
  initialAnswers: Record<string, string>;
  onStateChange: (state: AssessmentMirrorState) => void;
  onAutoSave: (answers: Record<string, string>) => void;
  onSubmit: () => void;
  mirrorState?: undefined;
}

interface ReadOnlyProps extends BaseProps {
  readOnly: true;
  mirrorState: AssessmentMirrorState;
  initialAnswers?: undefined;
  onStateChange?: undefined;
  onAutoSave?: undefined;
  onSubmit?: undefined;
}

type LiveAssessmentPanelProps = InteractiveProps | ReadOnlyProps;

/* -- Component ----------------------------------------------- */

export function LiveAssessmentPanel(props: LiveAssessmentPanelProps) {
  const { attemptId, title, questions, deadlineAt, room, readOnly } = props;

  const sortedQuestions = useMemo(
    () => [...questions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [questions],
  );
  const totalQuestions = sortedQuestions.length;

  // -- State --------------------------------------------------
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(
    readOnly ? (props.mirrorState?.answers ?? {}) : (props.initialAnswers ?? {}),
  );
  const [status, setStatus] = useState(readOnly ? props.mirrorState?.status ?? "in-progress" : "in-progress");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // -- ReadOnly: follow mirror state --------------------------
  useEffect(() => {
    if (!readOnly || !props.mirrorState) return;
    setCurrentIndex(props.mirrorState.questionIndex);
    setAnswers(props.mirrorState.answers);
    setStatus(props.mirrorState.status);
  }, [readOnly, props.mirrorState]);

  // -- Interactive: broadcast state --------------------------
  const onStateChangeRef = useRef(readOnly ? undefined : props.onStateChange);
  useEffect(() => {
    if (!readOnly) onStateChangeRef.current = props.onStateChange;
  }, [readOnly, props.onStateChange]);

  const latestStateRef = useRef({ questionIndex: currentIndex, answers, status });
  latestStateRef.current = { questionIndex: currentIndex, answers, status };

  // Broadcast immediately on question navigation
  useEffect(() => {
    if (readOnly) return;
    onStateChangeRef.current?.(latestStateRef.current);
  }, [readOnly, currentIndex]);

  // Heartbeat every 3s — covers answer changes + late-joining panelists
  useEffect(() => {
    if (readOnly) return;
    const interval = setInterval(() => {
      onStateChangeRef.current?.(latestStateRef.current);
    }, 3000);
    return () => clearInterval(interval);
  }, [readOnly]);

  // -- Interactive: auto-save (2s debounce) -------------------
  const onAutoSaveRef = useRef(readOnly ? undefined : props.onAutoSave);
  useEffect(() => {
    if (!readOnly) onAutoSaveRef.current = props.onAutoSave;
  }, [readOnly, props.onAutoSave]);

  useEffect(() => {
    if (readOnly || status === "submitted") return;
    const timeout = setTimeout(() => {
      if (Object.keys(answers).length > 0) {
        onAutoSaveRef.current?.(answers);
      }
    }, 2000);
    return () => clearTimeout(timeout);
  }, [readOnly, answers, status]);

  // -- Yjs docs for coding questions --------------------------
  const yjsProviders = useRef<Map<string, { ydoc: Y.Doc; provider: LiveKitYjsProvider }>>(new Map());

  const getOrCreateYjsProvider = useCallback(
    (questionId: string) => {
      if (yjsProviders.current.has(questionId)) {
        return yjsProviders.current.get(questionId)!;
      }
      const ydoc = new Y.Doc();
      const provider = new LiveKitYjsProvider(ydoc, room, `assessment-${attemptId}-${questionId}`);

      // Set awareness user info
      if (!readOnly) {
        provider.getAwareness().setLocalStateField("user", {
          name: "Candidate",
          color: "#3b82f6",
        });

        // Sync Yjs coding content back into answers state (for mirrorState broadcast + auto-save)
        const ytext = ydoc.getText("code");
        ytext.observe(() => {
          const code = ytext.toString();
          setAnswers((prev) => {
            if (prev[questionId] === code) return prev;
            return { ...prev, [questionId]: code };
          });
        });
      }

      yjsProviders.current.set(questionId, { ydoc, provider });
      return { ydoc, provider };
    },
    [room, attemptId, readOnly],
  );

  // Cleanup Yjs providers on unmount
  useEffect(() => {
    return () => {
      yjsProviders.current.forEach(({ provider }) => provider.destroy());
      yjsProviders.current.clear();
    };
  }, []);

  // -- Handlers -----------------------------------------------
  const setAnswer = useCallback((questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (readOnly || !props.onSubmit) return;
    setIsSubmitting(true);
    try {
      await props.onSubmit();
      setStatus("submitted");
    } finally {
      setIsSubmitting(false);
    }
  }, [readOnly, props.onSubmit]);

  const [timerExpired, setTimerExpired] = useState(false);
  const handleTimerExpired = useCallback(() => {
    setTimerExpired(true);
  }, []);

  // -- Derived ------------------------------------------------
  const currentQuestion = sortedQuestions[currentIndex];
  const answeredCount = Object.keys(answers).filter((k) => answers[k]?.trim()).length;
  const isSubmitted = status === "submitted";

  if (totalQuestions === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1a1a1a] text-neutral-500 text-sm">
        No questions in this assessment.
      </div>
    );
  }

  // -- Render -------------------------------------------------
  return (
    <div className="flex h-full flex-col bg-[#1a1a1a] text-neutral-100">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-100">{title}</p>
          <p className="text-xs text-neutral-500">
            {answeredCount} of {totalQuestions} answered
            {readOnly && " (viewing)"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSubmitted && (
            <span className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              Submitted
            </span>
          )}
          {deadlineAt && !isSubmitted && (
            timerExpired ? (
              <span className="flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-400">
                Time&apos;s up
              </span>
            ) : (
              <AssessmentTimer deadlineAt={deadlineAt} onExpired={handleTimerExpired} />
            )
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full bg-white/5">
        <div
          className="h-full bg-blue-500 transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
        />
      </div>

      {/* Question area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-3">
          <span className="text-xs font-medium text-neutral-500">
            Question {currentIndex + 1} of {totalQuestions}
          </span>
          <div
            className="dark"
            style={{
              "--background": "oklch(0.2 0.01 260)",
              "--foreground": "oklch(0.9 0.01 260)",
              "--border": "oklch(0.3 0.01 260)",
              "--muted-foreground": "oklch(0.55 0.01 260)",
            } as React.CSSProperties}
          >
            <Streamdown
              className="mt-2 prose prose-sm prose-invert max-w-none prose-p:my-1 prose-p:text-neutral-100 prose-strong:text-white prose-pre:my-2 [&_code:not(pre_code)]:text-[13px] [&_code:not(pre_code)]:text-cyan-300 [&_code:not(pre_code)]:bg-cyan-500/20 [&_code:not(pre_code)]:border [&_code:not(pre_code)]:border-cyan-500/30 [&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:px-1.5 [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:font-semibold [&_code:not(pre_code)]:font-mono text-neutral-100 leading-relaxed"
              controls={{ code: false }}
              shikiTheme={["github-dark", "github-dark"]}
            >
              {currentQuestion?.text ?? ""}
            </Streamdown>
          </div>
        </div>

        <div className="mt-4" key={currentQuestion?.id}>
          {currentQuestion?.type === "CODING_SNIPPET" ? (
            readOnly ? (
              // Panelist: show code from answers (via mirrorState or SSE), no Yjs needed
              <CodeEditor
                key={currentQuestion.id}
                value={answers[currentQuestion.id] ?? ""}
                onChange={() => {}}
                readOnly
                variant="live"
              />
            ) : (
              // Candidate: collaborative Yjs editor
              (() => {
                const { ydoc, provider } = getOrCreateYjsProvider(currentQuestion.id);
                return (
                  <CodeEditor
                    key={currentQuestion.id}
                    yjsProvider={provider}
                    ydoc={ydoc}
                    readOnly={isSubmitted}
                    variant="live"
                  />
                );
              })()
            )
          ) : (
            currentQuestion &&
            renderQuestion(
              currentQuestion,
              answers[currentQuestion.id] ?? "",
              (v) => !isSubmitted && setAnswer(currentQuestion.id, v),
              "live",
              readOnly || isSubmitted,
            )
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
        <Button
          variant="unstyled"
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0 || readOnly}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-200 hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </Button>

        {/* Question dots */}
        <div className="flex gap-1">
          {sortedQuestions.map((q, idx) => (
            <Button
              key={q.id}
              variant="unstyled"
              onClick={() => !readOnly && setCurrentIndex(idx)}
              disabled={readOnly}
              className={`h-2 w-2 rounded-full transition-colors ${
                idx === currentIndex
                  ? "bg-blue-500"
                  : answers[q.id]?.trim()
                    ? "bg-blue-500/40"
                    : "bg-white/10"
              }`}
            />
          ))}
        </div>

        {!readOnly && !isSubmitted && currentIndex === totalQuestions - 1 ? (
          <Button
            variant="unstyled"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? (
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
        ) : (
          <Button
            variant="unstyled"
            onClick={() => setCurrentIndex((i) => Math.min(totalQuestions - 1, i + 1))}
            disabled={currentIndex === totalQuestions - 1 || readOnly}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
