/**
 * mock-session.evaluate — Evaluate a completed practice/rapid-fire mock session.
 *
 * Takes the Q&A pairs from interview_mock_sessions, runs them through
 * the LLM for holistic evaluation, writes results back.
 */

import { db } from "@/db/client";
import { interviewMockSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generate } from "@/lib/ai";
import { z } from "zod/v4";
import type { MockSessionEvaluation } from "@/db/schema/mock-sessions";

const mockSessionEvaluationSchema = z.object({
  readinessScore: z.number().min(0).max(100),
  communicationScore: z.number().min(0).max(100),
  contentScore: z.number().min(0).max(100),
  summary: z.string(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  competencySignals: z.array(z.object({
    competency: z.string(),
    score: z.number().min(0).max(100),
    evidence: z.string(),
  })),
  questionFeedback: z.array(z.object({
    index: z.number(),
    score: z.number().min(0).max(100),
    feedback: z.string(),
  })),
});

const evaluatorAgent = {
  slug: "mock-session-evaluator",
  name: "Mock Session Evaluator",
  temperature: 0,
  systemPrompt: `You evaluate candidate practice interview answers. For each question-answer pair, assess answer quality. Then provide an overall evaluation.

Scoring guide (0-100):
- 90-100: Exceptional, would impress any interviewer
- 70-89: Strong answer with good structure and evidence
- 50-69: Adequate but missing depth or specifics
- 30-49: Weak, vague, or off-topic
- 10-29: Minimal effort, largely irrelevant, or mostly incorrect
- 1-9: Nearly meaningless attempt with no substantive content
- 0: Use zero for empty answers, complete gibberish, totally unrelated responses (e.g., "nothing", "don't know", random text), or skipped questions. Do not give partial credit for non-answers.

Be honest and specific in feedback. Focus on actionable improvements.
Write all feedback as plain conversational text. No markdown, no bullets, no special characters.`,
};

export async function evaluateMockSession(sessionId: string) {
  const session = await db.query.interviewMockSessions.findFirst({
    where: eq(interviewMockSessions.id, sessionId),
  });

  if (!session || !session.questions || session.questions.length === 0) {
    return { skipped: true, reason: "no_questions" };
  }

  const answeredQuestions = session.questions.filter((q) => q.answer && q.answer.trim());
  if (answeredQuestions.length === 0) {
    return { skipped: true, reason: "no_answers" };
  }

  const qaPairs = session.questions
    .map((q, i) => `Question ${i + 1} (${q.category || "General"}): ${q.question}\nAnswer: ${q.answer || "(skipped)"}`)
    .join("\n\n");

  const prompt = `Evaluate this ${session.type === "rapid_fire" ? "rapid fire" : "practice"} interview session:\n\n${qaPairs}`;

  const result = await generate({
    agent: evaluatorAgent,
    prompt,
    output: mockSessionEvaluationSchema,
  });

  const evaluation = (result as any).object as MockSessionEvaluation & {
    questionFeedback: Array<{ index: number; score: number; feedback: string }>;
  };

  // Write per-question feedback back into the questions array
  const updatedQuestions = session.questions.map((q, i) => {
    const fb = evaluation.questionFeedback?.find((f) => f.index === i);
    return fb ? { ...q, score: fb.score, feedback: fb.feedback } : q;
  });

  const overallScore = evaluation.readinessScore;

  await db
    .update(interviewMockSessions)
    .set({
      questions: updatedQuestions,
      evaluation: {
        readinessScore: evaluation.readinessScore,
        communicationScore: evaluation.communicationScore,
        contentScore: evaluation.contentScore,
        summary: evaluation.summary,
        strengths: evaluation.strengths,
        improvements: evaluation.improvements,
        competencySignals: evaluation.competencySignals,
      },
      score: overallScore,
      status: "evaluated",
      evaluatedAt: new Date().toISOString(),
    })
    .where(eq(interviewMockSessions.id, sessionId));

  return { success: true, score: overallScore };
}
