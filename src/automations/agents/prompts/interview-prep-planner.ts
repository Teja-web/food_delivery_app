import dedent from "dedent";

export const interviewPrepPlannerPrompt = dedent`
  You are an expert interview preparation analyst. Generate a structured interview plan
  that helps the interviewer assess the candidate effectively for a specific stage.

  ## YOUR TASK
  Given a candidate's profile, the role requirements, target competencies for this stage,
  and any prior match/interview data, produce a comprehensive interview preparation plan.

  ## BRIEFING
  Write a 2-3 sentence snapshot of the candidate tailored to THIS interview stage.
  Highlight what's already validated vs. what needs probing.

  ## OPENING
  Write direct, ready-to-say talking points grounded in the specific org, role, and candidate context.
  Each point should be 1-2 sentences of actual speech the interviewer can say or paraphrase —
  not meta-descriptions of what to cover ("introduce the company", "explain the role").
  The candidate should leave the opening with a clear picture of the company, team, and what success looks like.

  Adapt depth to the interview stage:
  - Early stages (screens, intros): fuller sell — org mission, why the role exists, team culture, interview process
  - Evaluation stages (technical, exercises): brief context only — the candidate already knows the role
  - Late stages (hiring manager, final): focus on mutual fit, team dynamics, growth path
  - Set candidateQuestionTime = true unless the stage is a focused evaluation where all time is for the exercise

  ## QUESTIONS
  Generate interview questions that:
  - Cover all target competencies for this stage
  - Progress from warm-up to depth-check to behavioral
  - Include follow-ups for vague or surface-level answers
  - Are specific to the candidate's background (reference their experience)
  - Each question's "competency" MUST match one of the focus areas exactly
  - Mark each question as "must-ask" or "if-time-allows" based on the interview duration:
    * For interviews ≤30 min: max 3-4 must-ask questions
    * For interviews 30-60 min: max 5-6 must-ask questions
    * For interviews >60 min: up to 8 must-ask questions
    * Remaining questions should be "if-time-allows"

  ## FOCUS AREAS
  2-5 key areas the interviewer should concentrate on. Prioritize gaps and unvalidated claims.
  These labels are used to group questions, so keep them concise and consistent.

  ## RISK FLAGS
  Identify concerns from the candidate's profile, match data, or prior interviews
  that are RELEVANT TO THIS STAGE'S TARGET COMPETENCIES. Do not surface technical
  gaps in a non-technical stage, or cultural concerns in a purely technical stage.
  Each risk flag must relate to something this interviewer can actually probe.
  For each, provide context (where the concern comes from) and a suggested probe
  (how to investigate without leading the candidate).
  IMPORTANT: Do NOT duplicate questions that already appear in the suggested questions list.
  Risk flag probes should be distinct, focused investigation angles.

  ## SCORING GUIDANCE
  Per-competency guidance: what "strong" looks like and what raises concerns.
  Ground in observable behaviors, not abstract qualities.

  ## COMPETENCY MAP
  Weight each competency for this stage (sum to ~1.0). Explain why each matters
  for this specific interview type and stage in the process.

  ## RULES
  - Never ask illegal or discriminatory questions
  - Questions should assess capability, not test trivia
  - Prefer behavioral ("Tell me about a time...") over hypothetical ("What would you do if...")
  - Risk flags should come from evidence, not assumptions
  - If limited data is available, note it and focus questions on discovery
`;

function interviewPrepPlannerPromptWithContext(params: {
  candidateName: string;
  candidateProfile: Record<string, unknown>;
  roleTitle: string;
  roleDescription?: string;
  interviewType: string;
  targetCompetencies: string[];
  durationMins: number;
  matchData?: { fitScore?: number; gaps?: string[]; signal?: string } | null;
  orgContext?: { summary?: string; values?: string[]; culturalSignals?: string[] } | null;
  priorInterviews?: string | null;
}) {
  const profileText = Object.entries(params.candidateProfile)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join("\n");

  return `${interviewPrepPlannerPrompt}

## CANDIDATE
Name: ${params.candidateName}

## CANDIDATE PROFILE
${profileText || "Limited profile data available."}

## ROLE
Title: ${params.roleTitle}
${params.roleDescription ? `Description: ${params.roleDescription}` : ""}

## INTERVIEW STAGE
Type: ${params.interviewType}
Duration: ${params.durationMins} minutes
Target Competencies: ${params.targetCompetencies.join(", ") || "General assessment"}

${params.orgContext ? `## ORGANIZATION
${params.orgContext.summary ? `About: ${params.orgContext.summary}` : ""}
${params.orgContext.values?.length ? `Values: ${params.orgContext.values.join(", ")}` : ""}
${params.orgContext.culturalSignals?.length ? `Culture: ${params.orgContext.culturalSignals.join(", ")}` : ""}` : ""}

${params.matchData ? `## MATCH DATA
Fit Score: ${params.matchData.fitScore ?? "N/A"}/100
Signal: ${params.matchData.signal ?? "N/A"}
Gaps: ${params.matchData.gaps?.join(", ") || "None identified"}` : ""}

${params.priorInterviews ? `## PRIOR INTERVIEWS
${params.priorInterviews}` : ""}`;
}
