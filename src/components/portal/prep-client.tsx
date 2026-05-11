"use client";

import { useEffect, useRef, useState } from "react";
import {
  Brain,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Lightbulb,
  MapPin,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Square,
  Target,
  ThumbsUp,
  Timer,
  TrendingUp,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { SpeechInput } from "@/components/portal/speech-input";
import { useVoicePrep } from "@/components/portal/hooks/use-voice-prep";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  fetchMockSession,
  submitMockSessionAnswers,
  endMockInterviewSession,
} from "@/actions/portal";

/* -- Types --------------------------------------------------- */

interface InterviewData {
  id: string;
  company: string;
  jobTitle: string;
  interviewer: string;
  interviewerRole: string;
  scheduledAt: string;
  type: string;
  focusAreas: string[];
  suggestedQuestions?: string[];
  durationMins?: number | null;
  location?: string | null;
}

interface PrepSession {
  id: string;
  type: string;
  createdAt: string;
  score: number | null;
  summary: string | null;
  feedback: string[];
}

interface PracticeQuestion {
  id: string;
  category: string;
  question: string;
  hint?: string;
  whyThisMatters?: string;
}

interface Evaluation {
  score: number;
  summary: string;
  breakdown: Array<{ questionId: string; score: number; feedback?: string }>;
}

/* -- Helpers ------------------------------------------------- */

function daysUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

const SIMULATION_MODES = [
  {
    id: "practice",
    title: "Practice Questions",
    subtitle: "AI-generated questions tailored to your target",
    icon: Brain,
    duration: "15 min",
    description:
      "Get tailored practice questions based on the role and your skills. Answer them and get instant AI evaluation with scoring and improvement tips.",
  },
  {
    id: "mock-interview",
    title: "Mock Interview",
    subtitle: "Full voice simulation with coaching",
    icon: Mic,
    duration: "45 min",
    description:
      "A simulated voice interview based on the role. Real-time coaching after each answer. Browser-based — no server required for speech.",
  },
  {
    id: "rapid-fire",
    title: "Rapid Fire",
    subtitle: "Timed rounds — think on your feet",
    icon: Zap,
    duration: "15 min",
    description:
      "Fast-paced rounds of 10 questions with a 30-second countdown. Build structured thinking under time pressure.",
  },
];

/* -- Component ----------------------------------------------- */

interface InterviewReadiness {
  topicsToExpect: string[];
  practicePrompts: string[];
  prepChecklist: string[];
}

interface RoleContext {
  jobTitle: string;
  department: string | null;
  location: string | null;
}

export function PrepClient({
  interview,
  prepSessions,
  candidateId,
  interviewReadiness,
  roleId,
  roleContext,
}: {
  interview: InterviewData;
  prepSessions: PrepSession[];
  candidateId: string;
  interviewReadiness?: InterviewReadiness | null;
  roleId?: string;
  roleContext?: RoleContext;
}) {
  const router = useRouter();
  const [activeMode, setActiveMode] = useState("practice");
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answer, setAnswer] = useState("");
  const [answeredQuestions, setAnsweredQuestions] = useState<Array<{ questionId: string; answer: string }>>([]);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [practiceComplete, setPracticeComplete] = useState(false);
  const sessionIdRef = useRef<string | null>(null);

  const hasInterview = !!(interview.id && interview.scheduledAt);
  const days = hasInterview ? daysUntil(interview.scheduledAt) : 0;

  async function startPractice() {
    setLoading(true);
    setQuestions([]);
    setCurrentQ(0);
    setAnswer("");
    setAnsweredQuestions([]);
    setEvaluation(null);
    setPracticeComplete(false);

    try {
      const body: Record<string, unknown> = {
        action: "questions",
        ...(roleId ? { roleId } : { interviewId: interview.id }),
      };
      const res = await fetch("/api/ai/portal/prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to generate questions");
      }

      // Fetch the generated questions from mock session
      const session = await fetchMockSession(json.sessionId);
      if (session?.questions && Array.isArray(session.questions)) {
        sessionIdRef.current = json.sessionId;
        const qs = session.questions.map((q, i) => ({
          id: `q-${i}`,
          category: q.category || "General",
          question: q.question || "",
          hint: q.hint,
          whyThisMatters: q.whyThisMatters,
        }));
        setQuestions(qs);
      } else {
        throw new Error("No questions found in session");
      }
    } catch (err) {
      console.error("[prep-client] Error starting practice:", err);
    } finally {
      setLoading(false);
    }
  }

  function submitAnswer() {
    if (!answer.trim() || !questions[currentQ]) return;

    const updated = [...answeredQuestions, { questionId: questions[currentQ].id, answer: answer.trim() }];
    setAnsweredQuestions(updated);

    if (currentQ < questions.length - 1) {
      setCurrentQ((prev) => prev + 1);
      setAnswer("");
    } else {
      setPracticeComplete(true);
      submitAllAnswers(updated);
    }
  }

  async function submitAllAnswers(answers: Array<{ questionId: string; answer: string }>) {
    if (!sessionIdRef.current) return;
    setEvaluating(true);

    try {
      // Submit answers by index
      const indexedAnswers = answers.map((a) => {
        const idx = parseInt(a.questionId.replace("q-", ""), 10);
        return { index: idx, answer: a.answer };
      });
      await submitMockSessionAnswers(sessionIdRef.current, indexedAnswers);

      // Poll for evaluation results (evaluation happens async on server)
      const maxAttempts = 30;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const session = await fetchMockSession(sessionIdRef.current!);
        if (session?.evaluation) {
          const eval_ = session.evaluation;
          const questions = (session.questions ?? []) as Array<{ score?: number; feedback?: string }>;
          setEvaluation({
            score: eval_.readinessScore ?? 0,
            summary: eval_.summary ?? "",
            breakdown: questions.map((q, i) => ({
              questionId: `q-${i}`,
              score: q.score ?? 0,
              feedback: q.feedback,
            })),
          });
          break;
        }
      }
    } catch (err) {
      console.error("[prep-client] Error submitting answers:", err);
    } finally {
      setEvaluating(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="space-y-8">
          {/* Back link */}
          <Link
            href={roleId ? `/roles/${roleId}` : "/roles"}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className="h-3 w-3 rotate-90" />
            {roleContext?.jobTitle ?? interview.jobTitle}
          </Link>

          {/* Context banner */}
          {hasInterview ? (
            <div className="flex items-start justify-between gap-4 rounded-xl border border-blue-100 bg-blue-50/30 p-5">
              <div>
                <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
                  Prep Studio
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Preparing for {interview.jobTitle} interview
                  {interview.interviewer ? ` with ${interview.interviewer}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  {interview.scheduledAt && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(interview.scheduledAt)}
                    </span>
                  )}
                  {interview.durationMins && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {interview.durationMins} min
                    </span>
                  )}
                  {interview.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {interview.location}
                    </span>
                  )}
                </div>
              </div>
              {days > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5 shrink-0">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <div>
                    <p className="text-sm font-bold text-amber-900">
                      {days} {days === 1 ? "day" : "days"}
                    </p>
                    <p className="text-[10px] text-amber-600">until interview</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-5">
              <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
                Prep Studio
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Practice for {roleContext?.jobTitle ?? interview.jobTitle}
                {roleContext?.department ? ` · ${roleContext.department}` : ""}
                {roleContext?.location ? ` · ${roleContext.location}` : ""}
              </p>
            </div>
          )}

          {/* Readiness checklist from focus areas */}
          {interview.focusAreas.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">
                  Readiness checklist
                </span>
              </div>
              <div className="space-y-2">
                {interview.focusAreas.map((area, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border text-[9px]">
                      {i + 1}
                    </span>
                    Prepare 2 examples for {area} with measurable outcomes
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggested questions from application analysis */}
          {interview.suggestedQuestions && interview.suggestedQuestions.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-semibold text-foreground">
                  Questions to prepare for
                </span>
              </div>
              <p className="mb-3 text-[11px] text-muted-foreground">
                Based on your match analysis for this role.
              </p>
              <div className="space-y-2">
                {interview.suggestedQuestions.map((q, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg bg-secondary/80 px-3 py-2">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[9px] font-bold text-amber-700">
                      {i + 1}
                    </span>
                    <p className="text-xs leading-relaxed text-muted-foreground">{q}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interview readiness from advisory */}
          {interviewReadiness && (interviewReadiness.topicsToExpect.length > 0 || interviewReadiness.prepChecklist.length > 0) && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              {interviewReadiness.topicsToExpect.length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Brain className="h-3.5 w-3.5 text-violet-500" />
                    Topics to expect
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {interviewReadiness.topicsToExpect.map((t, i) => (
                      <span key={i} className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[10px] font-medium text-violet-700">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {interviewReadiness.prepChecklist.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-foreground">Prep checklist</p>
                  <div className="space-y-1.5">
                    {interviewReadiness.prepChecklist.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border text-[9px]">
                          {i + 1}
                        </span>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {interviewReadiness.practicePrompts.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-foreground">Practice prompts</p>
                  <div className="space-y-1.5">
                    {interviewReadiness.practicePrompts.map((prompt, i) => (
                      <div key={i} className="rounded-lg bg-secondary/80 px-3 py-2">
                        <p className="text-xs leading-relaxed text-muted-foreground">{prompt}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Simulation modes */}
          <>
            <section>
                <h2 className="text-display-sm mb-4 text-foreground">
                  Choose your mode
                </h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  {SIMULATION_MODES.map((mode) => {
                    const Icon = mode.icon;
                    const isActive = activeMode === mode.id;
                    return (
                      <Button
                        key={mode.id}
                        variant="unstyled"
                        onClick={() => {
                          setActiveMode(mode.id);
                          setQuestions([]);
                          setEvaluation(null);
                          setAnswer("");
                        }}
                        className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
                          isActive
                            ? "border-stone-900 bg-primary text-white shadow-lg"
                            : "border-border bg-card hover:border-stone-300"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${isActive ? "text-amber-400" : "text-muted-foreground"}`} />
                          <h3 className={`text-sm font-semibold ${isActive ? "text-white" : "text-foreground"}`}>
                            {mode.title}
                          </h3>
                        </div>
                        <p className={`mt-1.5 text-xs leading-relaxed ${isActive ? "text-stone-300" : "text-muted-foreground"}`}>
                          {mode.subtitle}
                        </p>
                        <span className={`mt-2 inline-block text-[10px] font-medium ${isActive ? "text-stone-400" : "text-muted-foreground/70"}`}>
                          {mode.duration}
                        </span>
                      </Button>
                    );
                  })}
                </div>
                {SIMULATION_MODES.filter((m) => m.id === activeMode).map((mode) => (
                  <div key={mode.id} className="mt-4 flex items-start gap-3 rounded-xl bg-secondary px-5 py-4">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <p className="text-[13px] leading-relaxed text-muted-foreground">{mode.description}</p>
                  </div>
                ))}
              </section>

              {/* Practice Questions Mode */}
              {activeMode === "practice" && (
                <PracticeQuestionsSection
                  questions={questions}
                  currentQ={currentQ}
                  answer={answer}
                  evaluation={evaluation}
                  loading={loading}
                  evaluating={evaluating}
                  practiceComplete={practiceComplete}
                  onStart={startPractice}
                  onSubmitAnswer={submitAnswer}
                  onAnswerChange={setAnswer}
                />
              )}

              {/* Mock interview mode — voice */}
              {activeMode === "mock-interview" && (
                <MockInterviewSection interviewId={interview.id} roleId={roleId} />
              )}

              {/* Rapid fire mode */}
              {activeMode === "rapid-fire" && (
                <RapidFireSection
                  interviewId={interview.id}
                  roleId={roleId}
                />
              )}
          </>

          {/* Prep history */}
          {prepSessions.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-display-sm mb-4 text-foreground">
                Your prep history
              </h3>
              <div className="space-y-3">
                {prepSessions.map((session) => (
                  <PrepHistoryCard key={session.id} session={session} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/* -- Prep History View (no interview) ---------------------- */

export interface UpcomingInterviewBanner {
  id: string;
  jobTitle: string;
  scheduledAt: string;
  status: string;
}

function prepDaysUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export interface AvailableRole {
  id: string;
  title: string;
  location: string | null;
}

export function PrepHistoryView({
  prepSessions,
  upcomingInterviews = [],
  availableRoles = [],
}: {
  prepSessions: PrepSession[];
  upcomingInterviews?: UpcomingInterviewBanner[];
  availableRoles?: AvailableRole[];
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="space-y-8">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Prep Studio
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {upcomingInterviews.length > 0
                ? "Choose an interview to start prepping"
                : "Your past prep sessions"}
            </p>
          </div>

          {/* -- Upcoming Interviews ----------------------- */}
          {upcomingInterviews.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Calendar className="h-4 w-4 text-amber-600" />
                Upcoming interviews
              </h2>
              {upcomingInterviews.map((iv) => (
                <div key={iv.id} className="rounded-xl border border-amber-100 bg-amber-50/30 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                        <Calendar className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {iv.jobTitle}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(iv.scheduledAt).toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                          {" "}&middot; {prepDaysUntil(iv.scheduledAt)}
                        </p>
                      </div>
                    </div>
                    <Link
                      href={`/prep?interview=${iv.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
                    >
                      Prep now
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* -- Practice for a role (ungated) --------------- */}
          {availableRoles.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Target className="h-4 w-4 text-violet-500" />
                Practice for a role
              </h2>
              <p className="text-xs text-muted-foreground">
                No interview needed — practice questions tailored to any role you've applied for.
              </p>
              {availableRoles.map((role) => (
                <div key={role.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50">
                        <Brain className="h-5 w-5 text-violet-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{role.title}</p>
                        {role.location && (
                          <p className="text-xs text-muted-foreground">{role.location}</p>
                        )}
                      </div>
                    </div>
                    <Link
                      href={`/prep?role=${role.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
                    >
                      Practice
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </section>
          )}

          {upcomingInterviews.length === 0 && availableRoles.length === 0 && prepSessions.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-12 text-center">
              <Calendar className="h-8 w-8 text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium text-foreground">No upcoming interviews</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  When you have scheduled interviews, you can prep for them here.
                </p>
              </div>
            </div>
          )}

          {prepSessions.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-display-sm mb-4 text-foreground">
                Your prep history
              </h3>
              <div className="space-y-3">
                {prepSessions.map((session) => (
                  <PrepHistoryCard key={session.id} session={session} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/* -- Prep History Card -------------------------------------- */

function parseFeedbackItem(text: string): { strengths: string | null; improvements: string | null } {
  const sMatch = text.match(/Strengths?:\s*(.*?)(?=\.\.\s*Areas for improvement:|$)/is);
  const aMatch = text.match(/Areas for improvement:\s*(.*)/is);
  const strengths = sMatch?.[1]?.trim().replace(/\.+$/, "") || null;
  const improvements = aMatch?.[1]?.trim().replace(/\.+$/, "") || null;
  // If neither pattern matched, treat the whole thing as an improvement note
  if (!strengths && !improvements) return { strengths: null, improvements: text.trim() };
  return { strengths, improvements };
}

function PrepHistoryCard({ session }: { session: PrepSession }) {
  const [expanded, setExpanded] = useState(false);
  const feedbackItems = (session.feedback ?? []).map(parseFeedbackItem);
  const hasStrengths = feedbackItems.some((f) => f.strengths && f.strengths !== "None" && !f.strengths.startsWith("No "));
  const hasImprovements = feedbackItems.some((f) => f.improvements);
  const hasFeedback = session.summary || hasStrengths || hasImprovements;

  const scoreColor =
    (session.score ?? 0) >= 70 ? "text-emerald-600" :
    (session.score ?? 0) >= 40 ? "text-amber-600" :
    "text-red-500";
  const scoreBg =
    (session.score ?? 0) >= 70 ? "from-emerald-400 to-emerald-500" :
    (session.score ?? 0) >= 40 ? "from-amber-400 to-amber-500" :
    "from-red-400 to-red-500";

  return (
    <div className="rounded-lg border border-border bg-secondary/50">
      {/* Header — always visible */}
      <Button
        type="button"
        variant="unstyled"
        onClick={() => hasFeedback && setExpanded(!expanded)}
        className={`flex w-full items-center justify-between px-4 py-3 text-left ${hasFeedback ? "cursor-pointer" : "cursor-default"}`}
      >
        <div className="flex items-center gap-3">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            session.type === "mock_interview" ? "bg-violet-100" : "bg-muted"
          }`}>
            {session.type === "mock_interview" ? (
              <Mic className="h-4 w-4 text-violet-500" />
            ) : (
              <Brain className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-foreground">
              {session.type === "mock_interview" ? "Mock Interview" : "Practice Questions"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {new Date(session.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {session.score !== null && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${scoreBg}`}
                  style={{ width: `${session.score}%` }}
                />
              </div>
              <span className={`text-xs font-bold ${scoreColor}`}>{session.score}</span>
            </div>
          )}
          {hasFeedback && (
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
          )}
        </div>
      </Button>

      {/* Expanded detail */}
      {expanded && hasFeedback && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          {/* Summary */}
          {session.summary && (
            <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
              {session.summary}
            </p>
          )}

          <div className="space-y-3">
            {/* Strengths */}
            {hasStrengths && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <ThumbsUp className="h-3 w-3 text-emerald-500" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                    Strengths
                  </span>
                </div>
                <ul className="space-y-1 pl-[18px]">
                  {feedbackItems.map((f, i) =>
                    f.strengths && f.strengths !== "None" && !f.strengths.startsWith("No ") ? (
                      <li key={i} className="list-disc text-[11px] leading-relaxed text-foreground/80">
                        {f.strengths}
                      </li>
                    ) : null
                  )}
                </ul>
              </div>
            )}

            {/* Areas for improvement */}
            {hasImprovements && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <TrendingUp className="h-3 w-3 text-amber-500" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
                    Areas for improvement
                  </span>
                </div>
                <ul className="space-y-1 pl-[18px]">
                  {feedbackItems.map((f, i) =>
                    f.improvements ? (
                      <li key={i} className="list-disc text-[11px] leading-relaxed text-foreground/80">
                        {f.improvements}
                      </li>
                    ) : null
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* -- Practice Questions Section ----------------------------- */

function PracticeQuestionsSection({
  questions, currentQ, answer, evaluation, loading, evaluating, practiceComplete,
  onStart, onSubmitAnswer, onAnswerChange,
}: {
  questions: PracticeQuestion[];
  currentQ: number;
  answer: string;
  evaluation: Evaluation | null;
  loading: boolean;
  evaluating: boolean;
  practiceComplete: boolean;
  onStart: () => void;
  onSubmitAnswer: () => void;
  onAnswerChange: (v: string) => void;
}) {
  if (loading) {
    return (
      <section>
        <div className="flex flex-col items-center gap-6 rounded-2xl border border-border bg-card py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-stone-900" />
          <p className="text-sm font-semibold text-foreground">Setting up your session...</p>
          <div className="w-48">
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full animate-pulse rounded-full bg-primary" style={{ width: "60%" }} />
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Idle state — Play button
  if (questions.length === 0) {
    return (
      <section>
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card py-12">
          <Button
            variant="unstyled"
            onClick={onStart}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-primary transition-all hover:opacity-90 hover:shadow-lg active:scale-95"
          >
            <Play className="h-8 w-8 text-white" />
          </Button>
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">Practice Questions</p>
            <p className="mt-1 text-xs text-muted-foreground">
              AI-generated questions tailored to your target role
            </p>
          </div>
        </div>
      </section>
    );
  }

  // All questions answered — show evaluation or loading
  if (practiceComplete) {
    return (
      <section className="space-y-4">
        {evaluating && !evaluation && (
          <div className="flex flex-col items-center gap-6 rounded-2xl border border-border bg-card py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-stone-900" />
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">Evaluating your answers...</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Our AI coach is reviewing your responses
              </p>
            </div>
          </div>
        )}

        {evaluation && (
          <div className="feed-item-enter space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/30 px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                <Check className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Session complete</p>
                <p className="text-xs text-muted-foreground">
                  {questions.length} questions answered
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4">
              <div className="text-center">
                <p className="text-metric text-2xl text-foreground">{evaluation.score}</p>
                <p className="text-[9px] text-muted-foreground">score</p>
              </div>
              <div className="h-8 w-px bg-secondary" />
              <div className="flex-1">
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400"
                    style={{ width: `${evaluation.score}%` }}
                  />
                </div>
              </div>
            </div>

            {evaluation.breakdown.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                  Per-question feedback
                </p>
                {evaluation.breakdown.map((b, i) => {
                  const pct = b.score;
                  const q = questions[i];
                  return (
                    <div key={b.questionId} className="rounded-xl border border-border bg-card p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {q?.category ?? `Q${i + 1}`}
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-secondary">
                            <div
                              className={`h-full rounded-full ${pct >= 70 ? "bg-emerald-400" : pct >= 40 ? "bg-amber-400" : "bg-red-400"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-foreground">{pct}%</span>
                        </div>
                      </div>
                      {b.feedback && (
                        <p className="text-xs leading-relaxed text-muted-foreground">{b.feedback}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <Button
              variant="soft"
              onClick={onStart}
              className="rounded-lg px-4 py-2 text-xs"
            >
              <RotateCcw className="h-3 w-3" />
              Start another round
            </Button>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {questions[currentQ]?.category} · {currentQ + 1}/{questions.length}
          </span>
        </div>
        <p className="text-[15px] font-medium leading-relaxed text-foreground">
          {questions[currentQ]?.question}
        </p>

        {questions[currentQ]?.whyThisMatters && (
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {questions[currentQ].whyThisMatters}
          </p>
        )}

        <div className="mt-4">
          <div className="relative">
            <Textarea
              value={answer}
              onChange={(e) => onAnswerChange(e.target.value)}
              placeholder="Type or speak your answer..."
              rows={4}
              className="w-full rounded-xl border border-border bg-secondary px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-stone-400 focus:outline-none"
            />
            <div className="absolute bottom-3 right-3">
              <SpeechInput
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onTranscriptionChange={(text) => onAnswerChange(answer ? `${answer} ${text}` : text)}
              />
            </div>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              onClick={onSubmitAnswer}
              disabled={!answer.trim()}
              className="rounded-lg px-4 py-2 text-xs"
            >
              Submit answer
            </Button>
          </div>
        </div>
      </div>

      {/* Hint — shown after answer is submitted */}
      {questions[currentQ]?.hint && answer === "" && currentQ > 0 && questions[currentQ - 1]?.hint && (
        <div className="rounded-xl border border-amber-100 bg-amber-50/30 p-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-amber-700">
            Hint for previous question
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {questions[currentQ - 1]?.hint}
          </p>
        </div>
      )}
    </section>
  );
}

/* -- Mock Interview Section (Voice) -------------------------- */

function MockInterviewSection({
  interviewId,
  roleId,
}: {
  interviewId: string;
  roleId?: string;
  voiceMode?: "standard" | "premium";
}) {
  const voice = useVoicePrep({ interviewId, roleId });
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const [saving, setSaving] = useState(false);
  const startTimeRef = useRef<number>(Date.now());

  // Auto-scroll transcript
  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [voice.messages]);

  async function handleEnd() {
    setSaving(true);
    const transcript = voice.end();
    if (transcript.length > 0) {
      const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
      try {
        await endMockInterviewSession(interviewId, transcript, durationSeconds);
      } catch (e) {
        console.error("[mock-interview] Failed to save:", e);
      }
    }
    setSaving(false);
    setEnded(true);
  }

  function handlePause() {
    voice.pause();
    setPaused(true);
  }

  function handleResume() {
    voice.resume();
    setPaused(false);
  }

  // Ended state
  if (ended) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/30 py-12">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <Check className="h-8 w-8 text-emerald-600" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">Session complete</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Your mock interview has been saved.
          </p>
        </div>
        <Button
          variant="soft"
          onClick={() => { setEnded(false); setPaused(false); }}
          className="rounded-lg px-4 py-2 text-xs"
        >
          Start another session
        </Button>
      </div>
    );
  }

  // Idle — start button
  if (voice.state === "idle" && !paused) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card py-12">
        <Button
          variant="unstyled"
          onClick={() => { startTimeRef.current = Date.now(); voice.loadModels(); }}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-primary transition-all hover:opacity-90 hover:shadow-lg active:scale-95"
        >
          <Play className="h-8 w-8 text-white" />
        </Button>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">Mock Interview</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Real-time voice coaching — speak naturally and get instant feedback
          </p>
        </div>
      </div>
    );
  }

  if (voice.state === "loading") {
    const { vad, kokoro } = voice.loadingProgress;
    return (
      <div className="flex flex-col items-center gap-6 rounded-2xl border border-border bg-card py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-stone-900" />
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">Loading voice models...</p>
          <div className="mt-3 space-y-2 text-xs text-muted-foreground">
            <ModelLoadBar label="Voice detection" status={vad.status} progress={vad.progress} />
            <ModelLoadBar label="Speech synthesis" status={kokoro.status} progress={kokoro.progress} />
          </div>
        </div>
      </div>
    );
  }

  if (voice.state === "mic-error") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-red-200 bg-red-50/30 py-12">
        <p className="text-sm font-medium text-red-700">{voice.micError}</p>
        <Button
          variant="soft"
          onClick={voice.start}
          className="rounded-lg px-4 py-2 text-xs"
        >
          Try again
        </Button>
      </div>
    );
  }

  // Active or paused session
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden" style={{ height: 480 }}>
      <div className="flex flex-col h-full">
        {/* Transcript */}
        <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {voice.messages.length === 0 && !paused && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Start speaking to begin your practice session...
            </p>
          )}
          {voice.messages.map((entry, i) => (
            <div
              key={i}
              className={`rounded-lg px-3 py-2 text-sm max-w-[85%] ${
                entry.role === "user"
                  ? "bg-blue-50 text-blue-900 ml-auto"
                  : "bg-secondary text-foreground"
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                {entry.role === "user" ? "You" : "Coach"}
              </p>
              {entry.content}
              {entry.interrupted && (
                <span className="ml-1 text-[10px] text-muted-foreground italic">(interrupted)</span>
              )}
            </div>
          ))}
          {voice.state === "processing" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <div className="h-3 w-3 animate-spin rounded-full border border-border border-t-stone-900" />
              Thinking...
            </div>
          )}
          {paused && (
            <div className="flex items-center justify-center py-4">
              <span className="rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-700">
                Paused
              </span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="border-t border-border p-4 flex items-center justify-center gap-3">
          {voice.isSpeechDetected && voice.state === "listening" && (
            <span className="absolute left-4 text-[10px] text-emerald-600 font-medium">Listening...</span>
          )}
          {paused ? (
            <Button
              variant="unstyled"
              onClick={handleResume}
              className="rounded-full p-4 bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
            >
              <Play className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              variant="unstyled"
              onClick={handlePause}
              className="rounded-full p-4 bg-amber-100 text-amber-600 hover:bg-amber-200 transition-colors"
            >
              <Pause className="h-5 w-5" />
            </Button>
          )}
          <Button
            variant="unstyled"
            onClick={handleEnd}
            disabled={saving}
            className="rounded-full p-4 bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {saving
              ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              : <Square className="h-5 w-5" />
            }
          </Button>
        </div>
      </div>
    </div>
  );
}

function ModelLoadBar({ label, status, progress }: { label: string; status: string; progress: number }) {
  const pct = status === "ready" ? 100 : Math.round(progress);
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 text-right">{label}</span>
      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full transition-all ${status === "ready" ? "bg-emerald-400" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {status === "ready" ? (
        <Check className="h-3 w-3 text-emerald-500" />
      ) : (
        <span className="text-[10px] font-mono w-8">{pct}%</span>
      )}
    </div>
  );
}

/* -- Rapid Fire Section ------------------------------------- */

function RapidFireSection({
  interviewId,
  roleId,
}: {
  interviewId: string;
  roleId?: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "active" | "done">("idle");
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answer, setAnswer] = useState("");
  const [timeLeft, setTimeLeft] = useState(30);
  const [answers, setAnswers] = useState<Array<{ question: string; answer: string; skipped: boolean }>>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);

  useEffect(() => {
    if (state !== "active") return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Time's up — skip
          handleSubmitOrSkip(true);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state, currentQ]);

  async function startRound() {
    setState("loading");
    try {
      const body: Record<string, unknown> = { action: "questions", mode: "rapid_fire", ...(roleId ? { roleId } : { interviewId }) };

      const res = await fetch("/api/ai/portal/prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to generate questions");
      }

      // Fetch the generated questions from mock session
      const session = await fetchMockSession(json.sessionId);
      if (session?.questions && Array.isArray(session.questions)) {
        const qs = session.questions.map((q, i) => ({
          id: `q-${i}`,
          category: q.category || "General",
          question: q.question || "",
        }));
        setQuestions(qs.slice(0, 10));
        setCurrentQ(0);
        setAnswer("");
        setTimeLeft(30);
        setAnswers([]);
        setState("active");
      } else {
        throw new Error("No questions found");
      }
    } catch (err) {
      console.error("[prep-client] Rapid fire error:", err);
      setState("idle");
    }
  }

  function handleSubmitOrSkip(skipped: boolean) {
    if (timerRef.current) clearInterval(timerRef.current);

    const current = questions[currentQ];
    if (!current) return;

    const newAnswers = [...answers, { question: current.question, answer: answer.trim(), skipped }];
    setAnswers(newAnswers);

    if (currentQ + 1 >= questions.length) {
      setState("done");
    } else {
      setCurrentQ((prev) => prev + 1);
      setAnswer("");
      setTimeLeft(30);
    }
  }

  if (state === "idle") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card py-12">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary">
          <Zap className="h-8 w-8 text-white" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">Rapid Fire</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            10 questions, 30 seconds each. Answer fast — build your structured thinking muscle.
          </p>
        </div>
        <Button
          onClick={startRound}
          className="rounded-xl px-6 py-3"
        >
          <Zap className="h-4 w-4" />
          Start round
        </Button>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="flex flex-col items-center gap-6 rounded-2xl border border-border bg-card py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-stone-900" />
        <p className="text-sm font-semibold text-foreground">Setting up your session...</p>
        <div className="w-48">
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full animate-pulse rounded-full bg-primary" style={{ width: "60%" }} />
          </div>
        </div>
      </div>
    );
  }

  if (state === "done") {
    const answered = answers.filter((a) => !a.skipped).length;
    const skipped = answers.filter((a) => a.skipped).length;

    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
              <Check className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Round complete!</p>
              <p className="text-xs text-muted-foreground">
                {answered} answered, {skipped} skipped out of {answers.length}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {answers.map((a, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-secondary px-3 py-2">
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                  a.skipped ? "bg-stone-200 text-muted-foreground" : "bg-emerald-100 text-emerald-600"
                }`}>
                  {a.skipped ? "—" : "✓"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">{a.question}</p>
                  {a.answer && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{a.answer}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <Button
          variant="soft"
          onClick={() => { setState("idle"); setQuestions([]); setAnswers([]); }}
          className="rounded-lg px-4 py-2 text-xs"
        >
          <RotateCcw className="h-3 w-3" />
          Start another round
        </Button>
      </div>
    );
  }

  // Active state
  const current = questions[currentQ];
  const timerColor = timeLeft <= 10 ? "text-red-600" : timeLeft <= 20 ? "text-amber-600" : "text-muted-foreground";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {current?.category} · {currentQ + 1}/{questions.length}
          </span>
          <div className={`flex items-center gap-1.5 font-mono text-sm font-bold ${timerColor}`}>
            <Timer className="h-4 w-4" />
            {timeLeft}s
          </div>
        </div>

        {/* Timer bar */}
        <div className="mb-4 h-1 overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${
              timeLeft <= 10 ? "bg-red-400" : timeLeft <= 20 ? "bg-amber-400" : "bg-emerald-400"
            }`}
            style={{ width: `${(timeLeft / 30) * 100}%` }}
          />
        </div>

        <p className="text-[15px] font-medium leading-relaxed text-foreground">
          {current?.question}
        </p>

        <div className="mt-4">
          <div className="relative">
            <Textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type or speak your answer..."
              rows={3}
              className="w-full rounded-xl border border-border bg-secondary px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-stone-400 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitOrSkip(false);
              }
            }}
            />
            <div className="absolute bottom-3 right-3">
              <SpeechInput
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                autoRestart
                onTranscriptionChange={(text) => setAnswer((prev) => prev ? `${prev} ${text}` : text)}
              />
            </div>
          </div>
          <div className="mt-2 flex justify-between">
            <Button
              variant="soft"
              onClick={() => handleSubmitOrSkip(true)}
              className="rounded-lg px-4 py-2 text-xs"
            >
              Skip
            </Button>
            <Button
              onClick={() => handleSubmitOrSkip(false)}
              disabled={!answer.trim()}
              className="rounded-lg px-4 py-2 text-xs"
            >
              Submit & next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
