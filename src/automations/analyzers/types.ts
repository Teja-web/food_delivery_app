export interface AnalyzerInput {
  questions: Array<{
    id: string;
    text: string;
    type: string;
    weight: number;
    correctAnswer?: unknown;
    rubric?: unknown;
    options?: unknown;
  }>;
  answers: Record<string, unknown>;
  assessment: { title: string; type: string; config?: Record<string, unknown> };
  /** Diarized interview transcript — populated only for transcript-evidenced attempts. */
  transcript?: string;
}

import type { Rating } from "../agents/definitions/assessment-evaluator";

/** Maps rating bucket → 0-100 score */
export const RATING_SCORES: Record<Rating, number> = {
  excellent: 100,
  good: 75,
  adequate: 50,
  poor: 25,
  missing: 0,
};

export interface QuestionBreakdown {
  questionId: string;
  /** Rating bucket from AI evaluation */
  rating?: Rating;
  /** 0-100 percentage score (derived from rating for AI-evaluated, direct for MCQ) */
  score: number;
  /** Question weight for weighted average */
  weight: number;
  feedback?: string;
}

export interface AnalyzerOutput {
  score: number | null;
  breakdown: QuestionBreakdown[];
  insights?: Record<string, unknown>;
  summary: string;
}

export interface OutcomeAnalyzer {
  type: string;
  analyze(input: AnalyzerInput): Promise<AnalyzerOutput>;
}
