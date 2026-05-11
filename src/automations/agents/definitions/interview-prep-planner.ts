import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { interviewPrepPlannerPrompt } from "../prompts/interview-prep-planner";

export const interviewPrepSchema = z.object({
  briefing: z.string().describe("2-3 sentence candidate snapshot tailored to this interview stage."),
  opening: z.object({
    talkingPoints: z.array(z.string()).min(1).max(5).describe("Bullet points for the interviewer to cover at the start of the interview. Stage-dependent: phone screens include role sell and company pitch; technical rounds skip the sell and focus on setting context for the exercise."),
    candidateQuestionTime: z.boolean().describe("Whether to reserve time for candidate questions at the end. True for phone screens and final rounds; false for focused technical evaluations."),
  }).describe("How to open the interview — adapts to the stage."),
  questions: z.array(z.object({
    question: z.string().describe("The interview question to ask."),
    purpose: z.string().describe("Why this question matters for this stage."),
    followUps: z.array(z.string()).describe("1-2 follow-up probes if the answer is vague."),
    competency: z.string().describe("Which competency this question assesses. Must match a focus area."),
    priority: z.enum(["must-ask", "if-time-allows"]).describe("must-ask: essential for this stage. if-time-allows: valuable but can be skipped in short interviews."),
  })).min(4).max(10).describe("Ordered interview questions covering target competencies."),
  focusAreas: z.array(z.string()).min(2).max(5).describe("Key areas to probe in this interview. These are used to group questions, so competency values on questions must reference these."),
  riskFlags: z.array(z.object({
    flag: z.string().describe("The concern or gap."),
    context: z.string().describe("Where this concern comes from (resume gap, match data, prior interview)."),
    suggestedProbe: z.string().describe("A specific question or approach to validate this concern."),
  })).describe("Known risks or gaps to investigate."),
  scoringGuidance: z.array(z.object({
    competency: z.string().describe("Competency being scored."),
    lookFor: z.array(z.string()).describe("Signals of strong performance."),
    redFlags: z.array(z.string()).describe("Signals of concern."),
  })).describe("Per-competency scoring guidance for the interviewer."),
  competencyMap: z.array(z.object({
    competency: z.string().describe("Competency name."),
    weight: z.number().min(0).max(1).describe("Relative importance (0-1, should sum to ~1)."),
    rationale: z.string().describe("Why this competency matters for this stage."),
  })).describe("Weighted competency map for this interview stage."),
});

type InterviewPrepOutput = z.infer<typeof interviewPrepSchema>;

export const interviewPrepPlannerAgent = {
  slug: "interview-prep-planner" as const,
  name: "Interview Prep Planner",
  description: "Generates structured interview preparation plans with questions, risk flags, and scoring guidance tailored to the candidate, role, and stage.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.3,
  functionId: "interview-prep",
  systemPrompt: interviewPrepPlannerPrompt,
  outputSchema: interviewPrepSchema,
};
