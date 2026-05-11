import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { performanceReporterPrompt } from "../prompts/performance-reporter";

/**
 * AI-generated qualitative analysis only.
 * All numbers are computed server-side.
 */
export const performanceReportAISchema = z.object({
  overallHealth: z.enum(["healthy", "needs_attention", "critical"]).describe("Overall health across all roles."),
  roleAssessments: z.array(z.object({
    roleId: z.string(),
    health: z.enum(["healthy", "needs_attention", "critical"]),
    topCandidate: z.string().nullable().describe("Name of the strongest candidate, or null."),
    biggestBottleneck: z.string().nullable().describe("Most pressing issue, or null."),
  })).describe("Per-role qualitative assessment."),
  crossRoleInsights: z.array(z.string()).describe("3-5 insights spanning multiple roles — patterns, comparisons, systemic issues."),
  bottomlineAssessment: z.string().describe("2-3 sentence executive summary."),
  prioritizedActions: z.array(z.object({
    priority: z.enum(["high", "medium", "low"]),
    action: z.string(),
    roleTitle: z.string().describe("Which role this applies to, or 'All' for cross-cutting."),
    rationale: z.string(),
  })).describe("Top 5-10 prioritized actions."),
});

export type PerformanceReportAIOutput = z.infer<typeof performanceReportAISchema>;

/**
 * Server-computed metrics for the aggregated performance report.
 */
export interface PerformanceReportMetrics {
  reportType: "recruiter" | "hiring_manager" | "department";
  reportSubject: string;
  totalRoles: number;
  activeRoles: number;
  totalCandidates: number;
  overallConversionRate: string;
  avgDaysOpen: string;
  avgTimeToFill: string;
  roleSnapshots: Array<{
    roleId: string;
    roleTitle: string;
    department: string | null;
    status: string;
    daysOpen: number;
    totalCandidates: number;
    conversionRate: string;
  }>;
  sourceEffectiveness: Array<{
    source: string;
    totalCount: number;
    totalAdvanced: number;
    conversionRate: string;
  }>;
  interviewMetrics: {
    totalInterviews: number;
    completedInterviews: number;
    avgDaysToSchedule: string;
    scorecardCompletionRate: string;
    pendingScorecards: number;
  };
  generatedAt: string;
}

/** Combined report — metrics + AI analysis */
export interface PerformanceReport {
  metrics: PerformanceReportMetrics;
  analysis: PerformanceReportAIOutput;
}

export const performanceReporterAgent = {
  slug: "performance-reporter" as const,
  name: "Performance Reporter",
  description: "Generates qualitative analysis across multiple roles for a recruiter, hiring manager, or department.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.2,
  functionId: "performance-reporter",
  systemPrompt: performanceReporterPrompt,
  outputSchema: performanceReportAISchema,
};
