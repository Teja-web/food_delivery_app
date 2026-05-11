import { z } from "zod/v4";
import { generate } from "@/lib/ai";
import { assessmentEvaluatorAgent } from "../agents/definitions/assessment-evaluator";
import { RATING_VALUES, type Rating } from "../agents/definitions/assessment-evaluator";
import type { OutcomeAnalyzer, AnalyzerInput, AnalyzerOutput, QuestionBreakdown } from "./types";
import { RATING_SCORES } from "./types";

const interviewScoredItemSchema = z.object({
  rating: z.enum(RATING_VALUES).describe(
    "Rating bucket based on transcript evidence. 'missing' = the prompt was not addressed in the conversation."
  ),
  evidence: z.string().describe(
    "Verbatim quote(s) from the transcript that capture how the candidate addressed this prompt. Empty if not addressed."
  ),
  strengths: z.string().describe("Specific strengths demonstrated for this prompt"),
  weaknesses: z.string().describe("Specific gaps or weaknesses for this prompt"),
});

/**
 * interview_rubric — score each prompt against the candidate's verbal response in
 * the interview transcript. The prompt's rubric drives evaluation focus; this
 * analyzer is intentionally generic across scenario kinds (workflow problems,
 * behavioural probes, technical depth, judgment calls, etc.).
 */
export const interviewRubricAnalyzer: OutcomeAnalyzer = {
  type: "interview_rubric",

  async analyze(input: AnalyzerInput): Promise<AnalyzerOutput> {
    const transcript = input.transcript?.trim();
    const breakdown: QuestionBreakdown[] = [];

    if (!transcript) {
      for (const question of input.questions) {
        breakdown.push({
          questionId: question.id,
          rating: "missing" as Rating,
          score: RATING_SCORES.missing,
          weight: question.weight || 1,
          feedback: "No transcript available.",
        });
      }
      return {
        score: 0,
        breakdown,
        summary: "No transcript available — assessment could not be evaluated.",
      };
    }

    for (const question of input.questions) {
      const weight = question.weight || 1;

      const prompt = [
        `## Prompt`,
        question.text,
        question.rubric ? `\n## Rubric\n${JSON.stringify(question.rubric)}` : "",
        `\n## Interview Transcript`,
        transcript,
        `\n## Task`,
        `Find the section of the transcript where the candidate addresses this prompt.`,
        `Score the candidate's response against the rubric criteria above.`,
        `Use 'missing' if the prompt is not discussed.`,
        `Quote verbatim from the transcript as evidence.`,
      ].join("\n");

      const result = await generate({
        agent: assessmentEvaluatorAgent,
        prompt,
        output: interviewScoredItemSchema,
      });

      const data = result.object;
      const feedbackParts: string[] = [];
      if (data.evidence) feedbackParts.push(`Evidence: ${data.evidence}`);
      if (data.strengths) feedbackParts.push(`Strengths: ${data.strengths}`);
      if (data.weaknesses) feedbackParts.push(`Areas for improvement: ${data.weaknesses}`);

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
      summary: `Interview-scored assessment evaluated with overall score of ${score}%`,
    };
  },
};
