import { generate } from "@/lib/ai";
import { personalityAnalyzerAgent, personalityTraitSchema } from "../agents/definitions/assessment-personality-analyzer";
import type { OutcomeAnalyzer, AnalyzerInput, AnalyzerOutput } from "./types";

function resolveFramework(input: AnalyzerInput): string {
  const config = input.assessment.config;
  if (config?.framework && typeof config.framework === "string") {
    return config.framework;
  }
  // Fallback: infer from title
  const title = input.assessment.title.toLowerCase();
  if (title.includes("disc")) return "disc";
  if (title.includes("mbti") || title.includes("type indicator")) return "mbti";
  return "big_five";
}

export const personalityAnalyzer: OutcomeAnalyzer = {
  type: "personality",

  async analyze(input: AnalyzerInput): Promise<AnalyzerOutput> {
    const framework = resolveFramework(input);

    const qaPairs = input.questions.map((q) => {
      const answer = input.answers[q.id];
      const rubricInfo = q.rubric ? ` [Dimension: ${JSON.stringify(q.rubric)}]` : "";
      return `Q: ${q.text}${rubricInfo}\nA: ${String(answer ?? "(no answer)")}`;
    });

    const prompt = [
      `## Personality Assessment: ${input.assessment.title}`,
      `Framework: ${framework}`,
      `\n## Candidate Responses`,
      ...qaPairs,
    ].join("\n\n");

    const result = await generate({
      agent: personalityAnalyzerAgent,
      prompt,
      output: personalityTraitSchema,
    });

    const data = result.object;

    return {
      score: null,
      breakdown: [],
      insights: {
        traits: data.traits,
        framework: data.framework,
        typeCode: data.typeCode,
        narrative: data.narrative,
      },
      summary: data.typeCode
        ? `${data.typeCode} — ${data.narrative}\n\nNote: These are AI-interpreted behavioral indicators, not clinical personality assessments.`
        : `${data.narrative}\n\nNote: These are AI-interpreted behavioral indicators, not clinical personality assessments.`,
    };
  },
};
