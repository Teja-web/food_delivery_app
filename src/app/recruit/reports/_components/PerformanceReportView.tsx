"use client";

import {
  CheckCircle,
  Users,
  TrendingUp,
  Target,
  Zap,
  Megaphone,
  BarChart3,
  Briefcase,
  Clock,
} from "lucide-react";
import type { PerformanceReport } from "@/automations/agents/definitions/performance-reporter";
import { ReportShell } from "@/components/shared/report-shell";

const healthColors = {
  healthy: "text-emerald-600 bg-emerald-50 border-emerald-200",
  needs_attention: "text-amber-600 bg-amber-50 border-amber-200",
  critical: "text-red-600 bg-red-50 border-red-200",
};

const priorityColors = {
  high: "text-red-600 border-red-200",
  medium: "text-amber-600 border-amber-200",
  low: "text-muted-foreground border-border",
};

function reportTitle(report: PerformanceReport) {
  const prefix = report.metrics.reportType === "recruiter"
    ? "Recruiter Report"
    : report.metrics.reportType === "hiring_manager"
    ? "Hiring Manager Report"
    : "Department Report";
  return `${prefix}: ${report.metrics.reportSubject}`;
}

interface PerformanceReportViewProps {
  report: PerformanceReport;
}

export function PerformanceReportView({ report }: PerformanceReportViewProps) {
  const { metrics, analysis } = report;

  // Build lookup for AI role assessments
  const roleAssessmentMap = new Map(analysis.roleAssessments.map((r) => [r.roleId, r]));

  return (
    <ReportShell
      title={reportTitle(report)}
      generatedAt={metrics.generatedAt}
    >
      <div className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:grid-cols-4">
          <div className="report-card p-4 rounded-xl border bg-muted/30 print:p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Briefcase className="h-4 w-4 print:h-3 print:w-3" />
              <span className="text-xs">Active / Total Roles</span>
            </div>
            <p className="text-2xl font-bold print:text-lg">
              {metrics.activeRoles}{" "}
              <span className="text-sm font-normal text-muted-foreground">/ {metrics.totalRoles}</span>
            </p>
          </div>
          <div className="report-card p-4 rounded-xl border bg-muted/30 print:p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="h-4 w-4 print:h-3 print:w-3" />
              <span className="text-xs">Total Candidates</span>
            </div>
            <p className="text-2xl font-bold print:text-lg">{metrics.totalCandidates}</p>
          </div>
          <div className="report-card p-4 rounded-xl border bg-muted/30 print:p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4 print:h-3 print:w-3" />
              <span className="text-xs">Conversion Rate</span>
            </div>
            <p className="text-2xl font-bold print:text-lg">{metrics.overallConversionRate}</p>
          </div>
          <div className={`report-card p-4 rounded-xl border print:p-3 ${healthColors[analysis.overallHealth] || healthColors.healthy}`}>
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 print:h-3 print:w-3" />
              <span className="text-xs">Overall Health</span>
            </div>
            <p className="text-lg font-bold capitalize">{analysis.overallHealth.replace("_", " ")}</p>
          </div>
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-3 gap-4 print:grid-cols-3">
          <div className="report-card p-3 rounded-lg border bg-muted/20 text-center print:p-2">
            <p className="text-xs text-muted-foreground">Avg. Days Open</p>
            <p className="text-lg font-bold print:text-base">{metrics.avgDaysOpen}</p>
          </div>
          <div className="report-card p-3 rounded-lg border bg-muted/20 text-center print:p-2">
            <p className="text-xs text-muted-foreground">Avg. Time to Fill</p>
            <p className="text-lg font-bold print:text-base">{metrics.avgTimeToFill}</p>
          </div>
          <div className="report-card p-3 rounded-lg border bg-muted/20 text-center print:p-2">
            <p className="text-xs text-muted-foreground">Scorecard Completion</p>
            <p className="text-lg font-bold print:text-base">{metrics.interviewMetrics.scorecardCompletionRate}</p>
          </div>
        </div>

        {/* Bottom-line Assessment (AI) */}
        <div className="report-card p-4 rounded-xl border-2 border-primary/20 bg-primary/5 print:p-3">
          <p className="text-xs font-medium text-primary uppercase tracking-wide mb-2">Bottom Line</p>
          <p className="text-sm">{analysis.bottomlineAssessment}</p>
        </div>

        {/* Role Snapshots (metrics + AI assessment) */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-indigo-500 print:h-3 print:w-3" />
            Role Breakdown
          </h3>
          <div className="space-y-2">
            {metrics.roleSnapshots.map((role) => {
              const ai = roleAssessmentMap.get(role.roleId);
              return (
                <div key={role.roleId} className="report-card flex items-center justify-between p-3 rounded-lg border bg-muted/20 print:p-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate print:text-xs">{role.roleTitle}</p>
                      {role.department && <span className="text-[10px] text-muted-foreground">{role.department}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground">{role.totalCandidates} candidates</span>
                      <span className="text-xs text-muted-foreground">{role.conversionRate} conversion</span>
                      <span className="text-xs text-muted-foreground">{role.daysOpen}d open</span>
                    </div>
                    {ai?.biggestBottleneck && (
                      <p className="text-xs text-amber-600 mt-1">{ai.biggestBottleneck}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    {ai?.topCandidate && (
                      <span className="text-xs text-emerald-600 font-medium">{ai.topCandidate}</span>
                    )}
                    {ai && (
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${healthColors[ai.health] || ""}`}>
                        {ai.health.replace("_", " ")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cross-Role Insights (AI) */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Cross-Role Insights</h3>
          <ul className="space-y-1">
            {analysis.crossRoleInsights.map((insight, i) => (
              <li key={i} className="text-sm flex items-start gap-2 print:text-xs">
                <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5 print:h-3 print:w-3" />
                {insight}
              </li>
            ))}
          </ul>
        </div>

        {/* Source Effectiveness & Interview Metrics (computed) */}
        <div className="grid md:grid-cols-2 gap-4 print:grid-cols-2">
          {metrics.sourceEffectiveness.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-blue-500 print:h-3 print:w-3" />
                Source Effectiveness
              </h3>
              <div className="space-y-2">
                {metrics.sourceEffectiveness.map((src) => (
                  <div key={src.source} className="report-card flex items-center justify-between p-2.5 rounded-lg border bg-muted/20 print:p-2">
                    <span className="text-sm font-medium capitalize print:text-xs">{src.source}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{src.totalCount} total</span>
                      <span className="text-xs text-muted-foreground">{src.totalAdvanced} advanced</span>
                      <span className="text-xs font-medium text-emerald-600">{src.conversionRate}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500 print:h-3 print:w-3" />
              Interview Metrics
            </h3>
            <div className="report-card p-4 rounded-xl border bg-muted/20 space-y-3 print:p-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Total Interviews</p>
                  <p className="text-lg font-bold print:text-base">{metrics.interviewMetrics.totalInterviews}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Completed</p>
                  <p className="text-lg font-bold print:text-base">{metrics.interviewMetrics.completedInterviews}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg. to Schedule</p>
                  <p className="text-sm font-medium">{metrics.interviewMetrics.avgDaysToSchedule}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Scorecard Completion</p>
                  <p className="text-sm font-medium">{metrics.interviewMetrics.scorecardCompletionRate}</p>
                </div>
              </div>
              {metrics.interviewMetrics.pendingScorecards > 0 && (
                <p className="text-xs text-amber-600 font-medium">
                  {metrics.interviewMetrics.pendingScorecards} scorecard{metrics.interviewMetrics.pendingScorecards !== 1 ? "s" : ""} pending
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Prioritized Actions (AI) */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Prioritized Actions</h3>
          <div className="space-y-2">
            {analysis.prioritizedActions.map((action, i) => (
              <div key={i} className="report-card flex items-start gap-3 p-3 rounded-lg border bg-muted/20 print:p-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase shrink-0 ${priorityColors[action.priority] || priorityColors.low}`}>
                  {action.priority}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium print:text-xs">{action.action}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] rounded-full bg-secondary px-2 py-0.5 font-medium">{action.roleTitle}</span>
                    <p className="text-xs text-muted-foreground">{action.rationale}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ReportShell>
  );
}
