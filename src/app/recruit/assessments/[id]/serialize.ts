/**
 * Assessment detail page serialization
 */

import type { Assessment, AssessmentQuestion } from "@/db/schema/assessments";

import { ASSESSMENT_TYPES, QUESTION_TYPES } from "@/db/schema/assessments";

export { QUESTION_TYPES };

type AssessmentWithQuestions = Assessment & {
  questions?: AssessmentQuestion[];
};

export interface SerializedQuestion {
  id: string;
  text: string;
  type: string;
  order: number;
  weight: number;
  options: unknown;
  correctAnswer: unknown;
  rubric: unknown;
}

export interface SerializedAssessmentDetail {
  id: string;
  title: string;
  description: string | null;
  type: string | null;
  origin: string;
  status: string;
  visibility: string;
  questions: SerializedQuestion[];
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}

function formatDateTime(d: Date | string | null): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function serializeAssessmentDetail(assessment: AssessmentWithQuestions): SerializedAssessmentDetail {
  const questions = (assessment.questions ?? [])
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      order: q.order ?? 0,
      weight: q.weight ?? 1,
      options: q.options,
      correctAnswer: q.correctAnswer,
      rubric: q.rubric,
    }));

  return {
    id: assessment.id,
    title: assessment.title,
    description: assessment.description,
    type: assessment.type,
    origin: assessment.origin,
    status: assessment.status,
    visibility: assessment.visibility,
    questions,
    questionCount: questions.length,
    createdAt: formatDateTime(assessment.createdAt),
    updatedAt: formatDateTime(assessment.updatedAt),
  };
}
