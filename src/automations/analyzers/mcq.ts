import type { OutcomeAnalyzer, AnalyzerInput, AnalyzerOutput } from "./types";

// Normalize values for comparison - handles string/number mismatches and whitespace
function normalizeAnswer(value: unknown): string {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

export const mcqAnalyzer: OutcomeAnalyzer = {
  type: "mcq",

  async analyze(input: AnalyzerInput): Promise<AnalyzerOutput> {
    const breakdown = input.questions.map((q) => {
      const answer = input.answers[q.id];
      // Normalize both values to handle type mismatches (e.g., "42" vs 42) and whitespace
      const correct = answer != null && normalizeAnswer(answer) === normalizeAnswer(q.correctAnswer);
      const weight = q.weight || 1;
      return {
        questionId: q.id,
        score: correct ? 100 : 0,
        weight,
        feedback: correct ? "Correct" : "Incorrect",
      };
    });

    const totalWeight = breakdown.reduce((sum, b) => sum + b.weight, 0);
    const score = totalWeight > 0
      ? Math.round(breakdown.reduce((sum, b) => sum + b.score * b.weight, 0) / totalWeight)
      : 0;
    const correctCount = breakdown.filter((b) => b.score > 0).length;

    return {
      score,
      breakdown,
      summary: `Scored ${score}% (${correctCount}/${input.questions.length} correct)`,
    };
  },
};
