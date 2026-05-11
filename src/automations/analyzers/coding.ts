import { generate } from "@/lib/ai";
import { codeEvaluatorAgent, codeEvaluationSchema } from "../agents/definitions/assessment-code-evaluator";
import type { OutcomeAnalyzer, AnalyzerInput, AnalyzerOutput, QuestionBreakdown } from "./types";
import { RATING_SCORES } from "./types";

export const codingAnalyzer: OutcomeAnalyzer = {
  type: "coding",

  async analyze(input: AnalyzerInput): Promise<AnalyzerOutput> {
    const breakdown: QuestionBreakdown[] = [];

    for (const question of input.questions) {
      const answer = input.answers[question.id];
      const weight = question.weight || 1;

      const prompt = [
        `## Coding Question`,
        question.text,
        question.rubric ? `\n## Rubric\n${JSON.stringify(question.rubric)}` : "",
        `\n## Candidate Code\n\`\`\`\n${String(answer ?? "(no answer)")}\n\`\`\``,
      ].join("\n");

      const result = await generate({
        agent: codeEvaluatorAgent,
        prompt,
        output: codeEvaluationSchema,
      });

      const data = result.object;

      const feedbackParts: string[] = [];
      if (data.strengths) feedbackParts.push(`Strengths: ${data.strengths}`);
      if (data.improvements) feedbackParts.push(`Improvements: ${data.improvements}`);

      breakdown.push({
        questionId: question.id,
        rating: data.rating,
        score: RATING_SCORES[data.rating],
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
      summary: `Coding assessment evaluated with overall score of ${score}%`,
    };
  },
};
