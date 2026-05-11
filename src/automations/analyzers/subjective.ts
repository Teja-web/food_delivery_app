import { generate } from "@/lib/ai";
import { assessmentEvaluatorAgent, assessmentEvaluationSchema } from "../agents/definitions/assessment-evaluator";
import type { OutcomeAnalyzer, AnalyzerInput, AnalyzerOutput, QuestionBreakdown } from "./types";
import { RATING_SCORES } from "./types";

export const subjectiveAnalyzer: OutcomeAnalyzer = {
  type: "subjective",

  async analyze(input: AnalyzerInput): Promise<AnalyzerOutput> {
    const breakdown: QuestionBreakdown[] = [];

    for (const question of input.questions) {
      const answer = input.answers[question.id];
      const weight = question.weight || 1;
      const isEmpty = answer == null || String(answer).trim() === "" || String(answer).trim() === "(no answer)";

      const prompt = [
        `## Question (${question.type})`,
        question.text,
        question.rubric ? `\n## Rubric\n${JSON.stringify(question.rubric)}` : "",
        `\n## Candidate Answer\n${String(answer ?? "(no answer)")}`,
      ].join("\n");

      const result = await generate({
        agent: assessmentEvaluatorAgent,
        prompt,
        output: assessmentEvaluationSchema,
      });

      const data = result.object;
      // Force missing for empty answers regardless of LLM output
      const rating = isEmpty ? "missing" as const : data.rating;

      const feedbackParts: string[] = [];
      if (data.strengths) feedbackParts.push(`Strengths: ${data.strengths}`);
      if (data.weaknesses) feedbackParts.push(`Areas for improvement: ${data.weaknesses}`);

      breakdown.push({
        questionId: question.id,
        rating,
        score: RATING_SCORES[rating],
        weight,
        feedback: feedbackParts.join(". ") || undefined,
      });
    }

    const totalWeight = breakdown.reduce((sum, b) => sum + b.weight, 0);
    const score = totalWeight > 0
      ? Math.round(breakdown.reduce((sum, b) => sum + b.score * b.weight, 0) / totalWeight)
      : 0;

    return {
      score,
      breakdown,
      summary: `AI-evaluated assessment with overall score of ${score}%`,
    };
  },
};
