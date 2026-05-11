import { generate } from "@/lib/ai";
import {
  candidateInterviewCoachAgent,
  candidateInterviewCoachPracticeSchema,
  candidateInterviewCoachRapidFireSchema,
} from "@/automations/agents/definitions/candidate-interview-coach";
import {
  candidateInterviewCoachPromptWithContext,
  candidateRolePrepPromptWithContext,
} from "@/automations/agents/prompts/candidate-interview-coach";
import { runWithContext, buildScopedContext } from "@/lib/auth/context";
import { buildPrepContext, buildRolePrepContext } from "./prep-context";

/**
 * Generate candidate-facing practice questions from the interview plan.
 * Reads the pre-generated interview plan from interviewIntelligence.prep
 * and transforms it into candidate-appropriate material via the candidate-interview-coach agent.
 */
export async function generatePracticeQuestions(params: {
  candidateId: string;
  organizationId: string;
  interviewId: string;
  mode?: "practice" | "rapid_fire";
}) {
  const ctx = await buildPrepContext({
    candidateId: params.candidateId,
    interviewId: params.interviewId,
  });

  if (!ctx.existingPrep) {
    return { success: false as const, reason: "prep_not_ready" };
  }

  const mode = params.mode ?? "practice";
  const schema =
    mode === "rapid_fire" ? candidateInterviewCoachRapidFireSchema : candidateInterviewCoachPracticeSchema;

  const prompt = candidateInterviewCoachPromptWithContext(ctx, mode);
  const result = await generate({
    agent: candidateInterviewCoachAgent,
    prompt,
    output: schema,
  });
  const plan = (result as any).object;

  return {
    success: true as const,
    interviewId: params.interviewId,
    plan,
    mode,
  };
}

/**
 * Generate practice questions from role context only (no interview required).
 * Used for ungated prep — candidates can practice for any role they've applied to.
 */
export async function generateRolePracticeQuestions(params: {
  candidateId: string;
  organizationId: string;
  roleId: string;
  mode?: "practice" | "rapid_fire";
}) {
  const ctx = await buildRolePrepContext({
    candidateId: params.candidateId,
    roleId: params.roleId,
  });

  const mode = params.mode ?? "practice";
  const schema =
    mode === "rapid_fire" ? candidateInterviewCoachRapidFireSchema : candidateInterviewCoachPracticeSchema;

  const prompt = candidateRolePrepPromptWithContext(ctx, mode);
  const result = await generate({
    agent: candidateInterviewCoachAgent,
    prompt,
    output: schema,
  });
  const plan = (result as any).object;

  return {
    success: true as const,
    roleId: params.roleId,
    plan,
    mode,
  };
}

export async function submitPracticeAnswers(params: {
  attemptId: string;
  organizationId: string;
  answers: Record<string, string>;
}) {
  const { submitAttemptAnswers } = await import("@/operations/assessments");
  const ctx = buildScopedContext(params.organizationId, {
    id: "portal-user",
    name: "Portal",
  });
  await runWithContext(ctx, async () => {
    await submitAttemptAnswers(params.attemptId, params.answers);
  });
}
