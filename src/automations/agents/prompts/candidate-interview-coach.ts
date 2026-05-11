import dedent from "dedent";
import type { PrepContext } from "@/domain/portal/prep-context";
import type { InterviewPrep, InterviewEvaluation } from "@/db/schema/intelligence";

export const candidateInterviewCoachPrompt = dedent`
  You are a candidate-facing interview coach. Your job is to transform an interviewer's
  internal prep plan into practice material that helps the candidate perform their best.

  ## RULES
  - Never expose risk flags as "risks" or "red flags" — reframe as growth areas or focus topics
  - Never mention scoring guidance directly — distill into actionable hints
  - Never use recruiter/interviewer language: "probe", "assess", "evaluate", "red flag", "concern"
  - Questions should feel like supportive practice, not interrogation
  - Hints must be specific and actionable — not "give a good example" but "describe a time you
    led a cross-functional initiative, include the team size, timeline, and measurable outcome"
  - Use the candidate's actual experience and skills to make questions feel personal and relevant
  - Prioritize must-ask questions and high-weight competencies from the interview plan

  ## PRACTICE MODE
  Generate 6-8 practice questions with hints and context. Each question should:
  - Be reframed from the interviewer's question into a candidate-friendly practice prompt
  - Include a hint that tells the candidate what a strong answer looks like
  - Include whyThisMatters so the candidate understands what's being evaluated
  - Cover the interview's focus areas and high-weight competencies

  ## RAPID FIRE MODE
  Generate 10 short, direct questions. Each should:
  - Be under 20 words
  - Cover all focus areas from the interview plan
  - No hints, no follow-ups — just the question and category
  - Progress from warm-up to challenging
`;

/**
 * Role-only prompt: generates questions directly from role + competencies
 * without an interviewer's prep plan. Used for ungated prep.
 */
export function candidateRolePrepPromptWithContext(
  ctx: PrepContext,
  mode: "practice" | "rapid_fire",
): string {
  const modeInstruction =
    mode === "rapid_fire"
      ? "Generate 10 short, direct rapid-fire questions. No hints. Under 20 words each."
      : "Generate 6-8 practice questions. Each must include a hint and whyThisMatters.";

  const competencySection =
    ctx.targetCompetencies.length > 0
      ? `Target competencies: ${ctx.targetCompetencies.join(", ")}`
      : "Cover general interview competencies relevant to this role.";

  return `${candidateInterviewCoachPrompt}

## MODE
${modeInstruction}

${ctx.candidateContext}

## ROLE
Title: ${ctx.roleTitle}
${ctx.roleDescription ? `Description: ${ctx.roleDescription}` : ""}
Interview type: ${ctx.interviewType}
Duration: ${ctx.durationMins} minutes

## FOCUS AREAS (no interviewer plan available — generate from role context)
${competencySection}

Generate questions that cover these competencies, tailored to the candidate's background.
Prioritize questions that help the candidate prepare for common interview scenarios for this role.

${formatInterviewFeedback(ctx.interviewEvaluation as InterviewEvaluation | null)}`;
}

export function candidateInterviewCoachPromptWithContext(
  ctx: PrepContext,
  mode: "practice" | "rapid_fire",
): string {
  const plan = ctx.existingPrep as InterviewPrep | null;
  if (!plan) {
    throw new Error("Interview plan is required for candidate prep");
  }

  const modeInstruction =
    mode === "rapid_fire"
      ? "Generate 10 short, direct rapid-fire questions. No hints. Under 20 words each."
      : "Generate 6-8 practice questions. Each must include a hint and whyThisMatters.";

  return `${candidateInterviewCoachPrompt}

## MODE
${modeInstruction}

${ctx.candidateContext}

## ROLE
Title: ${ctx.roleTitle}
${ctx.roleDescription ? `Description: ${ctx.roleDescription}` : ""}
Interview type: ${ctx.interviewType}
Duration: ${ctx.durationMins} minutes

## INTERVIEW PLAN (from interviewer prep — transform for candidate)

### Focus Areas
${plan.focusAreas.join(", ")}

### Interviewer Questions
${plan.questions
  .map(
    (q, i) =>
      `${i + 1}. [${q.priority}] (${q.competency}) ${q.question}\n   Purpose: ${q.purpose}\n   Follow-ups: ${q.followUps.join("; ")}`,
  )
  .join("\n")}

### Risk Flags (reframe as growth areas for the candidate)
${plan.riskFlags.map((r) => `- ${r.flag}: ${r.context}`).join("\n") || "None"}

### Scoring Guidance (distill into hints)
${plan.scoringGuidance
  .map((s) => `- ${s.competency}: Look for: ${s.lookFor.join(", ")}`)
  .join("\n")}

### Competency Weights
${plan.competencyMap
  .map((c) => `- ${c.competency}: ${Math.round(c.weight * 100)}% — ${c.rationale}`)
  .join("\n")}

${formatInterviewFeedback(ctx.interviewEvaluation as InterviewEvaluation | null)}`;
}

/**
 * Format interview evaluation feedback for candidate coaching.
 * Reframes internal feedback as growth areas and strengths.
 */
function formatInterviewFeedback(evaluation: InterviewEvaluation | null): string {
  if (!evaluation) return "";

  const sections: string[] = ["## PREVIOUS INTERVIEW FEEDBACK (personalize coaching based on actual performance)"];

  // Standout moments → strengths to leverage
  if (evaluation.standoutMoments?.length) {
    sections.push("\n### Demonstrated Strengths (build on these)");
    sections.push(evaluation.standoutMoments.map((m) => `- ${m}`).join("\n"));
  }

  // Competency scores → areas to focus on
  if (evaluation.transcriptCompetencyScores?.length) {
    const needsWork = evaluation.transcriptCompetencyScores
      .filter((c) => c.score < 3)
      .map((c) => c.competency);
    if (needsWork.length) {
      sections.push("\n### Areas to Strengthen (prioritize practice questions here)");
      sections.push(needsWork.map((c) => `- ${c}`).join("\n"));
    }
  }

  // Key insights
  if (evaluation.keyInsights?.length) {
    sections.push("\n### Key Patterns Observed");
    sections.push(evaluation.keyInsights.map((i) => `- ${i}`).join("\n"));
  }

  // Topics already covered (avoid repetition)
  if (evaluation.topicsDiscussed?.length) {
    sections.push("\n### Topics Already Covered (vary the questions)");
    sections.push(evaluation.topicsDiscussed.join(", "));
  }

  return sections.length > 1 ? sections.join("\n") : "";
}
