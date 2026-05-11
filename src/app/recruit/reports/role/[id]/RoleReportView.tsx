"use client";

import {
  CheckCircle,
  AlertTriangle,
  Clock,
  Users,
  TrendingUp,
  Target,
  ArrowRight,
  Zap,
  ClipboardCheck,
  GitBranch,
  LogOut,
  Megaphone,
} from "lucide-react";
import type { RoleStatusReport } from "@/automations/agents/definitions/role-status-reporter";
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

interface RoleReportViewProps {
  roleId: string;
  roleTitle: string;
  department?: string;
  report: RoleStatusReport;
}

export function RoleReportView({ roleId, roleTitle, department, report }: RoleReportViewProps) {
  const { metrics, analysis } = report;

  const activeCandidates = metrics.candidates.filter((c) => !["rejected", "withdrawn", "hired"].includes(c.currentStage));
  const staleCandidates = activeCandidates.filter((c) => c.isStale);

  return (
    <ReportShell
      title={`Pipeline Status Report: ${roleTitle}`}
      subtitle={department}
      generatedAt={metrics.generatedAt}
    >
      <div className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 print:grid-cols-5">
          <div className="report-card p-4 rounded-xl border bg-muted/30 print:p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="h-4 w-4 print:h-3 print:w-3" />
              <span className="text-xs">Total Candidates</span>
            </div>
            <p className="text-2xl font-bold print:text-lg">{metrics.totalCandidates}</p>
          </div>
          <div className="report-card p-4 rounded-xl border bg-muted/30 print:p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="h-4 w-4 print:h-3 print:w-3" />
              <span className="text-xs">Days Open</span>
            </div>
            <p className="text-2xl font-bold print:text-lg">{metrics.daysOpen}</p>
          </div>
          <div className="report-card p-4 rounded-xl border bg-muted/30 print:p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4 print:h-3 print:w-3" />
              <span className="text-xs">Conversion Rate</span>
            </div>
            <p className="text-2xl font-bold print:text-lg">{metrics.conversionRate}</p>
          </div>
          <div className="report-card p-4 rounded-xl border bg-muted/30 print:p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="h-4 w-4 print:h-3 print:w-3" />
              <span className="text-xs">Avg. Time in Pipeline</span>
            </div>
            <p className="text-2xl font-bold print:text-lg">{metrics.averageTimeInPipeline}</p>
          </div>
          <div className={`report-card p-4 rounded-xl border print:p-3 ${healthColors[analysis.pipelineHealth.status] || healthColors.healthy}`}>
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 print:h-3 print:w-3" />
              <span className="text-xs">Pipeline Health</span>
            </div>
            <p className="text-lg font-bold capitalize">{analysis.pipelineHealth.status.replace("_", " ")}</p>
          </div>
        </div>

        {/* Stage Breakdown */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Pipeline Breakdown</h3>
          <div className="flex gap-2 flex-wrap">
            {metrics.byStage.map((stage) => (
              <div key={stage.stage} className="report-card flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30 print:px-2 print:py-1">
                <span className="text-sm font-medium capitalize print:text-xs">{stage.stage}</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold">{stage.count}</span>
                <span className="text-xs text-muted-foreground">({stage.percentage}%)</span>
              </div>
            ))}
          </div>
        </div>

        {/* Source Effectiveness */}
        {metrics.sourceEffectiveness.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-blue-500 print:h-3 print:w-3" />
              Source Effectiveness
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:grid-cols-4">
              {metrics.sourceEffectiveness.map((src) => (
                <div key={src.source} className="report-card p-3 rounded-lg border bg-muted/20 print:p-2">
                  <p className="text-xs font-medium capitalize">{src.source}</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-lg font-bold print:text-base">{src.count}</span>
                    <span className="text-xs text-muted-foreground">candidates</span>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-muted-foreground">{src.advancedCount} advanced</span>
                    <span className="text-xs font-medium text-emerald-600">({src.conversionRate})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Interview Velocity & Scorecard Completion */}
        <div className="grid md:grid-cols-2 gap-4 print:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500 print:h-3 print:w-3" />
              Interview Velocity
            </h3>
            <div className="report-card p-4 rounded-xl border bg-muted/20 space-y-3 print:p-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Scheduled</p>
                  <p className="text-lg font-bold print:text-base">{metrics.interviewVelocity.totalScheduled}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Completed</p>
                  <p className="text-lg font-bold print:text-base">{metrics.interviewVelocity.totalCompleted}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg. to Schedule</p>
                  <p className="text-sm font-medium">{metrics.interviewVelocity.avgDaysToSchedule}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg. to Complete</p>
                  <p className="text-sm font-medium">{metrics.interviewVelocity.avgDaysToComplete}</p>
                </div>
              </div>
              {metrics.interviewVelocity.pendingInterviews > 0 && (
                <p className="text-xs text-amber-600 font-medium">
                  {metrics.interviewVelocity.pendingInterviews} interview{metrics.interviewVelocity.pendingInterviews !== 1 ? "s" : ""} pending
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-indigo-500 print:h-3 print:w-3" />
              Scorecard Completion
            </h3>
            <div className="report-card p-4 rounded-xl border bg-muted/20 space-y-3 print:p-3">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold print:text-lg">{metrics.scorecardCompletion.completionRate}</span>
                <span className="text-xs text-muted-foreground">
                  {metrics.scorecardCompletion.totalCompleted} / {metrics.scorecardCompletion.totalExpected} submitted
                </span>
              </div>
              {metrics.scorecardCompletion.pendingReviewers.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-amber-600">Pending reviewers:</p>
                  {metrics.scorecardCompletion.pendingReviewers.map((pr, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      {pr.reviewerName} — {pr.candidateName}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stage Transitions & Drop-off */}
        <div className="grid md:grid-cols-2 gap-4 print:grid-cols-2">
          {metrics.stageTransitions.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-purple-500 print:h-3 print:w-3" />
                Stage Transition Times
              </h3>
              <div className="space-y-2">
                {metrics.stageTransitions.map((st) => (
                  <div key={st.stage} className="report-card flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium capitalize print:text-xs">{st.stage}</span>
                      <span className="text-[10px] text-muted-foreground">({st.candidateCount})</span>
                    </div>
                    <span className="text-sm font-semibold print:text-xs">{st.avgDaysInStage}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {metrics.dropOffAnalysis.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <LogOut className="h-4 w-4 text-red-500 print:h-3 print:w-3" />
                Drop-off Analysis
              </h3>
              <div className="space-y-2">
                {metrics.dropOffAnalysis.map((d) => (
                  <div key={d.stage} className="report-card flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
                    <div>
                      <span className="text-sm font-medium capitalize print:text-xs">{d.stage}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-red-500">{d.rejectedCount} rejected</span>
                        <span className="text-[10px] text-amber-500">{d.withdrawnCount} withdrawn</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold print:text-xs">{d.totalDropped}</span>
                      <p className="text-[10px] text-muted-foreground">{d.dropOffRate}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Insights & Recommendations (AI) */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Insights & Recommendations</h3>
          <div className="grid md:grid-cols-2 gap-4 print:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Insights</p>
              <ul className="space-y-1">
                {analysis.pipelineHealth.insights.map((insight, i) => (
                  <li key={i} className="text-sm flex items-start gap-2 print:text-xs">
                    <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5 print:h-3 print:w-3" />
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recommendations</p>
              <ul className="space-y-1">
                {analysis.pipelineHealth.recommendations.map((rec, i) => (
                  <li key={i} className="text-sm flex items-start gap-2 print:text-xs">
                    <ArrowRight className="h-4 w-4 text-amber-500 shrink-0 mt-0.5 print:h-3 print:w-3" />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Candidates (pre-generated intelligence from match + scorecard data) */}
        {activeCandidates.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Candidates</h3>
            <div className="space-y-3">
              {activeCandidates.map((c) => (
                <div key={c.candidateId} className="report-card p-4 rounded-xl border bg-muted/20 print:p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium print:text-sm">{c.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize">{c.currentStage}</span>
                        <span className="text-xs text-muted-foreground">{c.daysInPipeline} days</span>
                        <span className="text-xs text-muted-foreground capitalize">via {c.source}</span>
                        {c.isStale && (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                            {c.daysSinceLastActivity}d inactive
                          </span>
                        )}
                      </div>
                    </div>
                    {c.fitScore != null && (
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-lg font-bold">{c.fitScore}</p>
                        <p className="text-[10px] text-muted-foreground">fit score</p>
                      </div>
                    )}
                  </div>
                  {c.signal && (
                    <p className="text-xs text-emerald-600 mt-1">{c.signal}</p>
                  )}
                  {c.gaps.length > 0 && (
                    <p className="text-xs text-red-500 mt-1">Gaps: {c.gaps.join("; ")}</p>
                  )}
                  {c.summary && (
                    <div className="mt-2 p-2 rounded bg-muted/50">
                      <p className="text-xs">{c.summary}</p>
                    </div>
                  )}
                  {c.interviewSummary && (
                    <p className="text-xs text-muted-foreground mt-1">{c.interviewSummary}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stale Candidates */}
        {staleCandidates.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 print:h-3 print:w-3" />
              Candidates Needing Attention
            </h3>
            <div className="space-y-2">
              {staleCandidates.map((c) => (
                <div key={c.candidateId} className="report-card flex items-center justify-between p-3 rounded-lg border border-amber-200 bg-amber-50/50 print:p-2">
                  <div>
                    <p className="text-sm font-medium print:text-xs">{c.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{c.daysSinceLastActivity} days inactive</span>
                      <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize">{c.currentStage}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Next Steps (AI) */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Recommended Next Steps</h3>
          <div className="space-y-2">
            {analysis.nextSteps.map((step, i) => (
              <div key={i} className="report-card flex items-start gap-3 p-3 rounded-lg border bg-muted/20 print:p-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase shrink-0 ${priorityColors[step.priority] || priorityColors.low}`}>
                  {step.priority}
                </span>
                <div>
                  <p className="text-sm font-medium print:text-xs">{step.action}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.rationale}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ReportShell>
  );
}
