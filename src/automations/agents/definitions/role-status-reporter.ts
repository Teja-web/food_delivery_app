import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { roleStatusReporterPrompt } from "../prompts/role-status-reporter";

/**
 * AI schema — only pipeline-level qualitative analysis.
 * Per-candidate intelligence comes from pre-generated match/scorecard data.
 */
export const roleStatusReporterSchema = z.object({
  pipelineHealth: z.object({
    status: z.enum(["healthy", "needs_attention", "critical"]).describe("Overall pipeline health assessment."),
    insights: z.array(z.string()).describe("3-5 key observations about the pipeline state."),
    recommendations: z.array(z.string()).describe("3-5 actionable recommendations."),
  }),
  nextSteps: z.array(z.object({
    priority: z.enum(["high", "medium", "low"]),
    action: z.string(),
    rationale: z.string(),
  })).describe("Prioritized list of recommended next steps for this week."),
});

export type RoleReportAIOutput = z.infer<typeof roleStatusReporterSchema>;

/**
 * Server-computed metrics + pre-generated candidate intelligence.
 */
export interface RoleReportCandidate {
  candidateId: string;
  name: string;
  currentStage: string;
  source: string;
  daysInPipeline: number;
  daysInStage: number;
  daysSinceLastActivity: number;
  isStale: boolean;
  // Pre-generated match intelligence
  fitScore: number | null;
  signal: string | null;
  gaps: string[];
  summary: string | null;
  // Interview intelligence
  interviewSummary: string | null;
}

export interface RoleReportMetrics {
  daysOpen: number;
  totalCandidates: number;
  conversionRate: string;
  averageTimeInPipeline: string;
  byStage: Array<{ stage: string; count: number; percentage: number }>;
  sourceEffectiveness: Array<{ source: string; count: number; advancedCount: number; conversionRate: string }>;
  interviewVelocity: {
    totalScheduled: number;
    totalCompleted: number;
    avgDaysToSchedule: string;
    avgDaysToComplete: string;
    pendingInterviews: number;
  };
  scorecardCompletion: {
    totalExpected: number;
    totalCompleted: number;
    completionRate: string;
    pendingReviewers: Array<{ interviewId: string; candidateName: string; reviewerName: string }>;
  };
  stageTransitions: Array<{ stage: string; avgDaysInStage: string; candidateCount: number }>;
  dropOffAnalysis: Array<{ stage: string; rejectedCount: number; withdrawnCount: number; totalDropped: number; dropOffRate: string }>;
  candidates: RoleReportCandidate[];
  generatedAt: string;
}

/** Combined report — computed metrics + AI analysis */
export interface RoleStatusReport {
  metrics: RoleReportMetrics;
  analysis: RoleReportAIOutput;
}

export const roleStatusReporterAgent = {
  slug: "role-status-reporter" as const,
  name: "Role Status Reporter",
  description: "Generates pipeline health assessment and next steps for a role.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.2,
  functionId: "role-status-reporter",
  systemPrompt: roleStatusReporterPrompt,
  outputSchema: roleStatusReporterSchema,
};
