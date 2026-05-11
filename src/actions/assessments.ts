"use server";

import { z } from "zod/v4";
import {
  getAssessments as _getAssessments,
  getAssessment as _getAssessment,
  createAssessment as _createAssessment,
  updateAssessment as _updateAssessment,
  deleteAssessment as _deleteAssessment,
  getAssessmentQuestions as _getAssessmentQuestions,
  createAssessmentQuestion as _createAssessmentQuestion,
  updateAssessmentQuestion as _updateAssessmentQuestion,
  deleteAssessmentQuestion as _deleteAssessmentQuestion,
  getAssessmentAttempts as _getAssessmentAttempts,
  getAssessmentAttempt as _getAssessmentAttempt,
  createAssessmentAttempt as _createAssessmentAttempt,
  updateAssessmentAttempt as _updateAssessmentAttempt,
  deleteAssessmentAttempt as _deleteAssessmentAttempt,
  getAssessmentStats as _getAssessmentStats,
  launchLiveAssessment as _launchLiveAssessment,
  getInterviewLiveAttempts as _getInterviewLiveAttempts,
  saveAssessmentDraft as _saveAssessmentDraft,
  submitAssessmentAttempt as _submitAssessmentAttempt,
  endAssessmentAttempt as _endAssessmentAttempt,
  cancelAssessmentAttempt as _cancelAssessmentAttempt,
} from "@/operations/assessments";
import { assessmentAttempts } from "@/db/schema";
import { getActionContext, buildScopedContext, runWithContext } from "@/lib/auth/context";
import { generate, DEFAULT_MODEL } from "@/lib/ai";
import { eventBus } from "@/lib/events/bus";
import { db } from "@/db/client";
import { interviews } from "@/db/schema";
import { eq } from "drizzle-orm";

// --- Assessments ------------------------------------------------------------

export async function listAssessments(opts?: { offset?: number; limit?: number; sortBy?: string; sortOrder?: "asc" | "desc" }) {
  return _getAssessments(opts);
}

export async function fetchAssessment(id: string) {
  return _getAssessment(id);
}

export async function addAssessment(data: Record<string, unknown>) {
  const result = await _createAssessment(data);
  // Seed tour on first assessment (non-blocking)
  import("@/actions/tours").then(({ seedTourForUserAction }) =>
    seedTourForUserAction("first-assessment-created").catch(() => {}),
  );
  return result;
}

export async function editAssessment(id: string, data: Record<string, unknown>) {
  return _updateAssessment(id, data);
}

async function removeAssessment(id: string) {
  return _deleteAssessment(id);
}

// --- Assessment Questions ---------------------------------------------------

export async function listAssessmentQuestions(assessmentId: string) {
  return _getAssessmentQuestions(assessmentId);
}

export async function addAssessmentQuestion(data: Record<string, unknown>) {
  return _createAssessmentQuestion(data);
}

export async function editAssessmentQuestion(id: string, data: Record<string, unknown>) {
  return _updateAssessmentQuestion(id, data);
}

export async function removeAssessmentQuestion(id: string) {
  return _deleteAssessmentQuestion(id);
}

// --- Assessment Attempts ----------------------------------------------------

export async function listAssessmentAttempts(opts?: { offset?: number; limit?: number; sortBy?: string; sortOrder?: "asc" | "desc" }) {
  return _getAssessmentAttempts(opts);
}

export async function fetchAssessmentAttempt(id: string) {
  return _getAssessmentAttempt(id);
}

export async function addAssessmentAttempt(data: Record<string, unknown>) {
  return _createAssessmentAttempt(data);
}

export async function editAssessmentAttempt(id: string, data: Record<string, unknown>) {
  return _updateAssessmentAttempt(id, data);
}

async function removeAssessmentAttempt(id: string) {
  return _deleteAssessmentAttempt(id);
}

// --- Stats ------------------------------------------------------------------

export async function fetchAssessmentStats() {
  const ctx = await getActionContext();
  return _getAssessmentStats(ctx.organizationId);
}

// --- Live Interview Assessments ---------------------------------------------

export async function launchLiveAssessmentAction(
  interviewId: string,
  assessmentId: string,
  timeLimitMins?: number,
) {
  const ctx = await getActionContext();

  const interview = await db.query.interviews.findFirst({
    where: eq(interviews.id, interviewId),
    with: { application: true },
  });
  if (!interview) throw new Error("Interview not found");

  const result = await _launchLiveAssessment({
    interviewId,
    assessmentId,
    candidateId: interview.candidateId,
    organizationId: ctx.organizationId,
    applicationId: interview.applicationId ?? undefined,
    timeLimitMins,
  });

  eventBus.publish({
    type: "assessment_attempt.insert",
    payload: {
      entityType: "assessment_attempt",
      operation: "insert",
      entityId: result.attemptId,
      organizationId: ctx.organizationId,
    },
    timestamp: new Date().toISOString(),
  });

  return result;
}

/**
 * Live assessment updates — called by both candidates and panelists.
 * Looks up the attempt to get orgId, then runs CRUD via buildScopedContext
 * so candidates (who lack org session) can still go through the factory.
 */
export async function updateLiveAssessment(
  attemptId: string,
  data: { answers?: Record<string, string>; status?: "submitted" | "cancelled" },
) {
  // Plain query to get org context — no auth required
  const attempt = await db.query.assessmentAttempts.findFirst({
    where: eq(assessmentAttempts.id, attemptId),
  });
  if (!attempt) throw new Error("Attempt not found");

  const ctx = buildScopedContext(attempt.organizationId, {
    id: attempt.candidateId,
    name: "Candidate",
  });

  await runWithContext(ctx, async () => {
    if (data.status === "cancelled") {
      await _cancelAssessmentAttempt(attemptId);
    } else if (data.status === "submitted") {
      await _submitAssessmentAttempt(attemptId);
    } else if (data.answers) {
      await _saveAssessmentDraft(attemptId, data.answers);
    }
  });

  const eventOp = data.status === "submitted" ? "submit"
    : data.status === "cancelled" ? "cancel"
    : "update";

  eventBus.publish({
    type: `assessment_attempt.${eventOp}`,
    payload: {
      entityType: "assessment_attempt",
      operation: "update",
      entityId: attemptId,
      organizationId: attempt.organizationId,
    },
    timestamp: new Date().toISOString(),
  });

  // Fire-and-forget evaluation on submit (not on cancel)
  if (data.status === "submitted") {
    import("@/automations/tasks/assessment")
      .then(({ assessmentEvaluate }) =>
        assessmentEvaluate({ entityId: attemptId, organizationId: attempt.organizationId }),
      )
      .catch((e) => console.error("[live-assessment] Evaluation failed:", e));
  }

  return { success: true };
}

export async function fetchInterviewLiveAttempts(interviewId: string) {
  return _getInterviewLiveAttempts(interviewId);
}

// --- AI Generation ----------------------------------------------------------

const generateAssessmentPrompt = `You are an expert assessment designer who creates high-quality evaluation questions.

Given an assessment title, type, and description, generate appropriate questions.

## Question Type Guidelines

- **technical**: Mix of SHORT_TEXT (explain concepts, design solutions) and MCQ (knowledge checks). Include rubric criteria for SHORT_TEXT.
- **personality**: All SHORT_TEXT with behavioral/reflective questions. Each should have rubric criteria mapped to personality dimensions.
- **aptitude**: All MCQ with logical reasoning, numerical, verbal, and pattern recognition questions. Always include 4 options and the correct answer.
- **coding**: All CODING_SNIPPET with programming challenges. Include rubric criteria (correctness, code quality, efficiency).
- **case_study**: All SHORT_TEXT with scenario-based questions. Include rubric criteria (analysis depth, strategic thinking, feasibility).
- **interview_rubric**: All LONG_TEXT prompts authored as interviewer scripts — read aloud during a live interview, never filled in by the candidate. Generic across scenario kinds (workflow problems, behavioural probes, technical depth, judgment calls, etc.). Include rubric criteria appropriate to the prompt; the AI will score the transcript against them.

## Formatting

Question text supports **full markdown**. Use it to make questions clear and structured:
- Use \`inline code\` for function names, variables, and keywords
- Use fenced code blocks (\`\`\`language) for starter code, data structures, or examples the candidate should reference
- Use numbered lists for multi-step instructions
- Use bold for emphasis on key constraints or requirements
- For CODING_SNIPPET questions, always include a code block showing the function signature, class skeleton, or sample input/output

## Rules
- Questions should be clear, unambiguous, and professionally worded
- MCQ options should be plausible — avoid obviously wrong answers
- Rubric criteria should be specific and measurable
- Vary difficulty across questions
- Weight harder questions higher (2-3) and straightforward ones lower (1)
- Generate 5-8 questions depending on assessment complexity
`;

const generatedQuestionsSchema = z.object({
  questions: z.array(z.object({
    text: z.string().describe("The question text"),
    type: z.enum(["SHORT_TEXT", "MCQ", "CODING_SNIPPET"]).describe("Question format"),
    weight: z.number().int().min(1).max(5).describe("Question weight/importance"),
    options: z.array(z.string()).nullable().describe("MCQ answer options (4 options for MCQ type, null for other types)"),
    correctAnswer: z.string().nullable().describe("Correct answer for MCQ, null for other types"),
    rubric: z.array(z.object({
      label: z.string().describe("Rubric criterion name"),
      weight: z.number().int().min(1).max(5).describe("Criterion weight"),
    })).nullable().describe("Evaluation criteria for SHORT_TEXT/CODING_SNIPPET, null for MCQ"),
  })),
});

const generateAssessmentAgent = {
  slug: "generate-assessment",
  name: "Assessment Question Generator",
  description: "Generates assessment questions tailored to the assessment type, title, and description.",
  model: DEFAULT_MODEL,
  temperature: 0.7,
  systemPrompt: generateAssessmentPrompt,
};

export async function generateAssessmentQuestions(params: {
  assessmentId: string;
  title: string;
  type: string | null;
  description: string | null;
  instructions?: string | null;
}) {
  const { assessmentId, title, type, description, instructions } = params;

  const trimmedInstructions = instructions?.trim();

  const prompt = `Generate assessment questions for:

**Title:** ${title}
**Type:** ${type ?? "general"}
**Description (candidate-facing problem statement):** ${description ?? "No description provided"}
${trimmedInstructions ? `\n**Additional generation instructions (recruiter-only, do not echo to candidate):**\n${trimmedInstructions}\n` : ""}
Generate appropriate questions based on the assessment type. The description above is shown verbatim to candidates as the problem statement — your questions should probe the candidate against it without restating it. Return structured JSON.`;

  const result = await generate({
    agent: generateAssessmentAgent,
    prompt,
    output: generatedQuestionsSchema,
  });

  // Save generated questions to the database
  const savedQuestions = [];
  for (let i = 0; i < result.object.questions.length; i++) {
    const q = result.object.questions[i];
    const saved = await _createAssessmentQuestion({
      assessmentId,
      text: q.text,
      type: q.type,
      order: i,
      weight: q.weight,
      options: q.options,
      correctAnswer: q.correctAnswer,
      rubric: q.rubric,
    });
    savedQuestions.push(saved);
  }

  return { success: true, questions: savedQuestions, count: savedQuestions.length };
}
