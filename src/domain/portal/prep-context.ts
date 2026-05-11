/**
 * Interview Prep Context Builder
 *
 * Builds rich context for all 3 prep modes (Practice Questions, Mock Interview, Rapid Fire).
 * Always interview-specific — requires an interviewId.
 *
 * Uses entity context building blocks (candidateCrud.getEntityContext) for candidate data,
 * then adds interview-specific fields (stage, duration, existing prep).
 */

import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import {
  interviews,
  interviewIntelligence,
  interviewStages,
  applications,
  roles,
} from "@/db/schema";
import type { InterviewPrep } from "@/db/schema/intelligence";
import { getCandidateContext } from "@/operations/candidates";
import { stripSensitiveIntelligence } from "./privacy";

/* -- Types --------------------------------------------------- */

export interface PrepContext {
  /** Pre-digested candidate context text (privacy-stripped for candidate audience) */
  candidateContext: string;
  roleTitle: string;
  roleDescription?: string;
  interviewType: string;
  targetCompetencies: string[];
  durationMins: number;
  /** Cached prep from interview_intelligence — caller decides whether to reuse */
  existingPrep?: unknown | null;
  /** Interview evaluation/feedback from completed interviews — used for personalized coaching */
  interviewEvaluation?: unknown | null;
}

/* -- Main builder -------------------------------------------- */

export async function buildPrepContext(params: {
  candidateId: string;
  interviewId: string;
}): Promise<PrepContext> {
  const { candidateId, interviewId } = params;

  // Entity context building block — includes intelligence, interviews, assessments, match history
  // Stripped for candidate-facing audience
  const rawContext = await getCandidateContext(candidateId);
  const candidateContext = rawContext ? stripSensitiveText(rawContext) : "No candidate data available.";

  // Fetch interview chain
  const interview = await db.query.interviews.findFirst({
    where: eq(interviews.id, interviewId),
  });
  if (!interview) {
    throw new Error("Interview not found");
  }

  const application = await db.query.applications.findFirst({
    where: eq(applications.id, interview.applicationId),
  });
  if (!application) {
    throw new Error("Application not found");
  }

  const [role, existingIntel] = await Promise.all([
    db.query.roles.findFirst({ where: eq(roles.id, application.roleId) }),
    db.query.interviewIntelligence.findFirst({
      where: eq(interviewIntelligence.interviewId, interviewId),
    }),
  ]);

  if (!role) {
    throw new Error("Role not found");
  }

  // Derive target competencies from interview stage
  let targetCompetencies: string[] = [];
  if (interview.stageId) {
    const stage = await db.query.interviewStages.findFirst({
      where: eq(interviewStages.id, interview.stageId),
    });
    targetCompetencies = stage?.competencies ?? [];
  }
  if (targetCompetencies.length === 0) {
    const allStages = await db.query.interviewStages.findMany({
      where: eq(interviewStages.roleId, role.id),
    });
    const matchingStage = allStages.find(
      (s) =>
        s.type === interview.interviewType ||
        s.name === interview.interviewType,
    );
    targetCompetencies = matchingStage?.competencies ?? [];
  }

  return {
    candidateContext,
    roleTitle: role.title,
    roleDescription: role.description ?? undefined,
    interviewType: interview.interviewType ?? "general",
    targetCompetencies,
    durationMins: interview.durationMins ?? 45,
    existingPrep: existingIntel?.prep ?? null,
    interviewEvaluation: existingIntel?.evaluation ?? null,
  };
}

/* -- Role-only builder (ungated prep) ------------------------ */

export async function buildRolePrepContext(params: {
  candidateId: string;
  roleId: string;
}): Promise<PrepContext> {
  const { candidateId, roleId } = params;

  const rawContext = await getCandidateContext(candidateId);
  const candidateContext = rawContext ? stripSensitiveText(rawContext) : "No candidate data available.";

  const role = await db.query.roles.findFirst({ where: eq(roles.id, roleId) });
  if (!role) throw new Error("Role not found");

  // Gather competencies from all stages for the role
  const stages = await db.query.interviewStages.findMany({
    where: eq(interviewStages.roleId, roleId),
  });
  const targetCompetencies = [...new Set(stages.flatMap((s) => s.competencies ?? []))];

  // Use the first stage's duration as a sensible default
  const durationMins = stages[0]?.durationMins ?? 45;

  return {
    candidateContext,
    roleTitle: role.title,
    roleDescription: role.description ?? undefined,
    interviewType: "general",
    targetCompetencies,
    durationMins,
    existingPrep: null,
  };
}

/**
 * Strip sensitive recruiter-facing data from context text for candidate-facing use.
 * Removes sections that contain internal scoring, recommendations, and assessments.
 */
function stripSensitiveText(text: string): string {
  // Remove internal-only sections from the context text
  const sensitiveHeaders = ["### Talent Assessment", "### Match History"];
  let result = text;
  for (const header of sensitiveHeaders) {
    const idx = result.indexOf(header);
    if (idx === -1) continue;
    // Find the next section header or end of text
    const nextHeader = result.indexOf("\n### ", idx + header.length);
    const nextTopHeader = result.indexOf("\n## ", idx + header.length);
    const end = Math.min(
      nextHeader === -1 ? Infinity : nextHeader,
      nextTopHeader === -1 ? Infinity : nextTopHeader,
    );
    result = result.slice(0, idx) + (end === Infinity ? "" : result.slice(end));
  }
  return result.trim();
}

/* -- Voice prompt builder ------------------------------------ */

export function prepContextToVoicePrompt(ctx: PrepContext): string {
  const plan = ctx.existingPrep as InterviewPrep | null;

  const sections: string[] = [
    `You are a mock interviewer conducting a practice session for a ${ctx.roleTitle} role.`,
    "",
    "CRITICAL OUTPUT RULES:",
    "- Plain text only. No markdown, no bullet points, no asterisks, no dashes, no numbered lists.",
    "- No special characters. Write naturally as if speaking aloud.",
    "- Keep every response to 1 to 3 short sentences maximum.",
    "- Your output will be read aloud by a text to speech engine, so write exactly how you would say it.",
    "",
    "TURN TAKING:",
    "- If the candidate's message sounds incomplete, cut off mid sentence, or ends with words like um, so, and, like, or a trailing thought, respond ONLY with: ...",
    "- Three dots means you are still listening. Only respond with real content when the candidate has clearly finished their thought.",
    "- Look for complete sentences, a clear conclusion, or an explicit signal like that is all or yeah that is my answer.",
    "- When in doubt, respond with ... and let them continue.",
    "",
    "HOW TO CONDUCT THE SESSION:",
    "- You drive the conversation. Start with a warm greeting, then ask the first question immediately.",
    "- Ask one question at a time. Wait for their answer.",
    "- After they answer, give one sentence of feedback, then move to the next question.",
    "- Use the follow up questions if their answer is too short or vague.",
    "- Keep the pace moving. Do not lecture or explain at length.",
    "- If they go off topic, gently redirect with the next question.",
    "- After all questions, wrap up with a brief encouraging summary.",
  ];

  // Candidate context (already privacy-stripped)
  sections.push("", ctx.candidateContext);

  // Role context
  sections.push("", `ROLE: ${ctx.roleTitle}`);
  if (ctx.roleDescription) sections.push(ctx.roleDescription);

  // Interview plan — the actual script to follow
  if (plan) {
    // Opening
    if (plan.opening.talkingPoints.length > 0) {
      sections.push("", "OPENING");
      sections.push(
        `Start by briefly mentioning: ${plan.opening.talkingPoints.join(". ")}.`,
        "Then ask the first question.",
      );
    }

    // Questions in order — this is the script
    const allQuestions = [
      ...plan.questions.filter((q) => q.priority === "must-ask"),
      ...plan.questions.filter((q) => q.priority === "if-time-allows"),
    ];
    if (allQuestions.length > 0) {
      sections.push("", "QUESTIONS TO ASK IN ORDER");
      for (let i = 0; i < allQuestions.length; i++) {
        const q = allQuestions[i];
        let line = `${i + 1}. ${q.question}`;
        if (q.followUps.length > 0) {
          line += ` Follow ups if needed: ${q.followUps.join(". ")}`;
        }
        sections.push(line);
      }
    }

    // Risk areas to naturally probe
    if (plan.riskFlags.length > 0) {
      sections.push("", "AREAS TO DIG INTO");
      for (const r of plan.riskFlags) {
        sections.push(`${r.flag}: ${r.suggestedProbe}`);
      }
    }

    // Focus areas
    if (plan.focusAreas.length > 0) {
      sections.push("", `Focus on: ${plan.focusAreas.join(", ")}`);
    }

    // Competency weights
    if (plan.competencyMap.length > 0) {
      const top = [...plan.competencyMap]
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 3);
      sections.push(
        `Most important competencies: ${top.map((c) => c.competency).join(", ")}`,
      );
    }
  } else {
    // No plan — fall back to generic questions based on competencies
    if (ctx.targetCompetencies.length > 0) {
      sections.push(
        "",
        "TOPICS TO COVER",
        `Ask questions about: ${ctx.targetCompetencies.join(", ")}`,
      );
    }
  }

  return sections.join("\n");
}
