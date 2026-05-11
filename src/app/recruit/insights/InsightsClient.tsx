"use client";

import {
  Activity,
  BarChart3,
  Briefcase,
  Check,
  Clock,
  FileCheck,
  Handshake,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useEntityEvent } from "@/hooks/use-entity-event";
import type { InsightsPageProps } from "./serialize";

function urgencyColor(urgency: string) {
  switch (urgency) {
    case "high": return "text-red-600 bg-red-50 border-red-200";
    case "medium": return "text-amber-700 bg-amber-50 border-amber-200";
    case "low": return "text-blue-700 bg-blue-50 border-blue-200";
    default: return "text-muted-foreground bg-secondary border-border";
  }
}

const declineReasonLabels: Record<string, string> = {
  comp_gap: "Compensation gap",
  competing_offer: "Competing offer",
  role_fit: "Role fit",
  personal: "Personal reasons",
  timeline: "Timeline",
  other: "Other",
};

export default function InsightsClient({
  hiringVelocity,
  pipelineHealth,
  sourceEffectiveness,
  recentHires,
  bottlenecks,
  openRoles,
  offerAcceptance,
  interviewOutcomes,
  teamActivity,
}: InsightsPageProps) {
  useEntityEvent(["role", "application", "candidate", "offer"]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="space-y-8">
          <div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <BarChart3 className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Insights</span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">How is hiring going?</h1>
            <p className="mt-1 text-sm text-muted-foreground">Operational intelligence across all active searches. Updated in real time.</p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-metric text-2xl text-foreground">{hiringVelocity.avgDaysToFill}d</p>
              <p className="mt-0.5 text-xs font-medium text-foreground">Avg time to fill</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Target: {hiringVelocity.target}d</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-metric text-2xl text-foreground">{pipelineHealth.totalActive}</p>
              <p className="mt-0.5 text-xs font-medium text-foreground">Active candidates</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Across {pipelineHealth.openRoles} open roles</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-metric text-2xl text-foreground">{pipelineHealth.conversionRate}%</p>
              <p className="mt-0.5 text-xs font-medium text-foreground">Pipeline conversion</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Sourced &rarr; Hired</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-metric text-2xl text-foreground">{pipelineHealth.totalHired}</p>
              <p className="mt-0.5 text-xs font-medium text-foreground">Total hires</p>
              <p className="mt-1 text-[10px] text-muted-foreground">All time</p>
            </div>
          </div>

          {bottlenecks.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Where hiring is stuck</h2>
              </div>
              <div className="space-y-3">
                {bottlenecks.map((item, idx) => (
                  <div key={idx} className="rounded-xl border border-border bg-card px-5 py-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize", urgencyColor(item.urgency))}>{item.urgency}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{item.issue}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.impact}</p>
                        <div className="mt-2 rounded-lg bg-secondary/80 px-3 py-2">
                          <p className="text-[11px] text-muted-foreground"><span className="font-semibold text-foreground">Suggestion:</span> {item.suggestion}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {offerAcceptance.sent > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Handshake className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Offer acceptance</h2>
                <span className="text-xs text-muted-foreground">Are we losing candidates at the finish line?</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className={cn("text-metric text-2xl", offerAcceptance.acceptanceRate >= 70 ? "text-emerald-700" : offerAcceptance.acceptanceRate >= 50 ? "text-amber-700" : "text-red-600")}>{offerAcceptance.acceptanceRate}%</p>
                  <p className="mt-0.5 text-xs font-medium text-foreground">Acceptance rate</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{offerAcceptance.accepted} of {offerAcceptance.sent} offers</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-metric text-2xl text-foreground">{offerAcceptance.pending}</p>
                  <p className="mt-0.5 text-xs font-medium text-foreground">Pending</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">Awaiting response</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-metric text-2xl text-red-600">{offerAcceptance.declined}</p>
                  <p className="mt-0.5 text-xs font-medium text-foreground">Declined</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">All time</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-metric text-2xl text-muted-foreground">{offerAcceptance.withdrawn}</p>
                  <p className="mt-0.5 text-xs font-medium text-foreground">Withdrawn</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">By employer</p>
                </div>
              </div>

              {offerAcceptance.declineReasons.length > 0 && (
                <div className="mt-4 rounded-xl border border-border bg-card px-5 py-4">
                  <p className="mb-3 text-xs font-semibold text-foreground">Why candidates decline</p>
                  <div className="space-y-2">
                    {offerAcceptance.declineReasons.map((r) => {
                      const pct = offerAcceptance.declined > 0 ? Math.round((r.count / offerAcceptance.declined) * 100) : 0;
                      return (
                        <div key={r.reason} className="flex items-center gap-3">
                          <span className="w-32 text-xs text-muted-foreground">{declineReasonLabels[r.reason] ?? r.reason}</span>
                          <div className="flex-1">
                            <div className="relative h-2 rounded-full bg-secondary overflow-hidden">
                              <div className="h-full rounded-full bg-red-400" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                          <span className="w-12 text-right text-xs tabular-nums font-semibold text-foreground">{r.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {offerAcceptance.trend.length > 1 && (
                <div className="mt-4 rounded-xl border border-border bg-card overflow-hidden">
                  <div className="grid grid-cols-[1fr_60px_60px_60px_70px] gap-3 border-b border-border bg-secondary/50 px-5 py-2.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Month</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center">Sent</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center">Accepted</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center">Declined</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center">Rate</span>
                  </div>
                  {offerAcceptance.trend.map((t) => (
                    <div key={t.month} className="grid grid-cols-[1fr_60px_60px_60px_70px] gap-3 border-b border-border/60 px-5 py-3 last:border-b-0">
                      <p className="self-center text-xs font-semibold text-foreground">{t.month}</p>
                      <p className="self-center text-xs tabular-nums text-muted-foreground text-center">{t.sent}</p>
                      <p className="self-center text-xs tabular-nums text-emerald-700 font-semibold text-center">{t.accepted}</p>
                      <p className="self-center text-xs tabular-nums text-red-600 text-center">{t.declined}</p>
                      <p className={cn("self-center text-xs tabular-nums font-semibold text-center", t.rate >= 70 ? "text-emerald-700" : t.rate >= 50 ? "text-amber-700" : "text-red-600")}>{t.rate}%</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {interviewOutcomes.totalCompleted > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Interview outcomes</h2>
                <span className="text-xs text-muted-foreground">Quality signals across your interview panels</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-metric text-2xl text-foreground">{interviewOutcomes.advanceRate}%</p>
                  <p className="mt-0.5 text-xs font-medium text-foreground">Interview → Advance</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">Reached offer or hired</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className={cn("text-metric text-2xl", interviewOutcomes.panelAgreementRate >= 80 ? "text-emerald-700" : interviewOutcomes.panelAgreementRate >= 60 ? "text-amber-700" : "text-red-600")}>{interviewOutcomes.panelAgreementRate}%</p>
                  <p className="mt-0.5 text-xs font-medium text-foreground">Panel agreement</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{interviewOutcomes.multiPanelCount} multi-panel interviews</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-metric text-2xl text-foreground">{interviewOutcomes.totalCompleted}</p>
                  <p className="mt-0.5 text-xs font-medium text-foreground">Completed interviews</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">All time</p>
                </div>
              </div>

              {interviewOutcomes.scoresByRole.length > 0 && (
                <div className="mt-4 rounded-xl border border-border bg-card overflow-hidden">
                  <div className="grid grid-cols-[1fr_80px_80px] gap-3 border-b border-border bg-secondary/50 px-5 py-2.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Role</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center">Avg score</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center">Scorecards</span>
                  </div>
                  {interviewOutcomes.scoresByRole.map((r) => (
                    <div key={r.roleId} className="grid grid-cols-[1fr_80px_80px] gap-3 border-b border-border/60 px-5 py-3 last:border-b-0">
                      <p className="self-center text-xs font-semibold text-foreground truncate">{r.role}</p>
                      <div className="self-center flex items-center justify-center gap-1.5">
                        <span className={cn("text-xs tabular-nums font-semibold", r.avgScore >= 4 ? "text-emerald-700" : r.avgScore >= 3 ? "text-amber-700" : "text-red-600")}>{r.avgScore}</span>
                        <span className="text-[10px] text-muted-foreground">/ 5</span>
                      </div>
                      <p className="self-center text-xs tabular-nums text-muted-foreground text-center">{r.scorecardCount}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {hiringVelocity.byRole.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Time to fill by role</h2>
                <span className="text-xs text-muted-foreground">Target: {hiringVelocity.target} days</span>
              </div>
              <div className="space-y-2">
                {hiringVelocity.byRole.map((role) => {
                  const pct = Math.min((role.days / 60) * 100, 100);
                  const targetPct = (role.target / 60) * 100;
                  return (
                    <div key={role.roleId} className="rounded-xl border border-border bg-card px-5 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-foreground">{role.role}</p>
                        <div className="flex items-center gap-2">
                          <span className={cn("text-xs font-semibold tabular-nums", role.status === "ahead" ? "text-emerald-700" : "text-amber-700")}>{role.days}d</span>
                          {role.status === "ahead" ? <TrendingDown className="h-3 w-3 text-emerald-600" /> : <TrendingUp className="h-3 w-3 text-amber-600" />}
                        </div>
                      </div>
                      <div className="relative h-2 rounded-full bg-secondary overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all", role.status === "ahead" ? "bg-emerald-400" : "bg-amber-400")} style={{ width: `${pct}%` }} />
                        <div className="absolute top-0 h-full w-px bg-foreground/30" style={{ left: `${targetPct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {sourceEffectiveness.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Source effectiveness</h2>
              </div>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="grid grid-cols-[1fr_80px_60px_90px_70px] gap-3 border-b border-border bg-secondary/50 px-5 py-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Source</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Candidates</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Hires</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Conversion</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Avg fit</span>
                </div>
                {sourceEffectiveness.map((source) => (
                  <div key={source.source} className="grid grid-cols-[1fr_80px_60px_90px_70px] gap-3 border-b border-border/60 px-5 py-3 last:border-b-0">
                    <p className="self-center text-xs font-semibold text-foreground">{source.source}</p>
                    <p className="self-center text-xs tabular-nums text-muted-foreground">{source.candidates}</p>
                    <p className="self-center text-xs tabular-nums text-foreground font-semibold">{source.hires}</p>
                    <p className={cn("self-center text-xs tabular-nums font-semibold", source.conversionRate >= 10 ? "text-emerald-700" : "text-muted-foreground")}>{source.conversionRate}%</p>
                    <p className="self-center text-xs tabular-nums text-muted-foreground">{source.avgFit || "-"}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {openRoles.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Open roles pipeline</h2>
              </div>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="grid grid-cols-[1fr_60px_70px_70px_50px_50px] gap-3 border-b border-border bg-secondary/50 px-5 py-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Role</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center">Days</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center">Sourced</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center">Interview</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center">Offer</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center">Hired</span>
                </div>
                {openRoles.map((role) => (
                  <Link
                    key={role.id}
                    href={`/recruit/roles/${role.id}`}
                    className="grid grid-cols-[1fr_60px_70px_70px_50px_50px] gap-3 border-b border-border/60 px-5 py-3 last:border-b-0 hover:bg-secondary/30 transition-colors"
                  >
                    <div className="self-center min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{role.title}</p>
                      {role.department && (
                        <p className="text-[10px] text-muted-foreground truncate">{role.department}</p>
                      )}
                    </div>
                    <p className="self-center text-xs tabular-nums text-muted-foreground text-center">{role.daysOpen}d</p>
                    <p className={cn("self-center text-xs tabular-nums text-center font-medium", role.stages.sourced > 0 ? "text-foreground" : "text-muted-foreground/50")}>{role.stages.sourced}</p>
                    <p className={cn("self-center text-xs tabular-nums text-center font-medium", role.stages.interview > 0 ? "text-blue-600" : "text-muted-foreground/50")}>{role.stages.interview}</p>
                    <p className={cn("self-center text-xs tabular-nums text-center font-medium", role.stages.offer > 0 ? "text-amber-600" : "text-muted-foreground/50")}>{role.stages.offer}</p>
                    <p className={cn("self-center text-xs tabular-nums text-center font-medium", role.stages.hired > 0 ? "text-emerald-600" : "text-muted-foreground/50")}>{role.stages.hired}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {teamActivity.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Team activity</h2>
                <span className="text-xs text-muted-foreground">Last 30 days</span>
              </div>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="grid grid-cols-[1fr_80px_80px_90px_60px] gap-3 border-b border-border bg-secondary/50 px-5 py-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Team member</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center">Applications</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center">Interviews</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center">Offers</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center">Total</span>
                </div>
                {teamActivity.map((member) => {
                  const maxTotal = teamActivity[0]?.total ?? 1;
                  return (
                    <div key={member.userId} className="grid grid-cols-[1fr_80px_80px_90px_60px] gap-3 border-b border-border/60 px-5 py-3 last:border-b-0">
                      <div className="self-center min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{member.name}</p>
                        <div className="mt-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full rounded-full bg-primary/40" style={{ width: `${(member.total / maxTotal) * 100}%` }} />
                        </div>
                      </div>
                      <p className="self-center text-xs tabular-nums text-muted-foreground text-center">{member.applications}</p>
                      <p className="self-center text-xs tabular-nums text-muted-foreground text-center">{member.interviews}</p>
                      <p className="self-center text-xs tabular-nums text-muted-foreground text-center">{member.offers}</p>
                      <p className="self-center text-xs tabular-nums font-semibold text-foreground text-center">{member.total}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {recentHires.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Check className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Recent hires</h2>
              </div>
              <div className="space-y-2">
                {recentHires.map((hire) => (
                  <div key={hire.id} className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground">{hire.name}</p>
                      <p className="text-[11px] text-muted-foreground">{hire.role}</p>
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">{hire.daysToFill}d to fill</span>
                    <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{hire.source}</span>
                    <span className="text-[11px] text-muted-foreground">{hire.date}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {pipelineHealth.totalActive === 0 && recentHires.length === 0 && openRoles.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-12 text-center">
              <BarChart3 className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm font-semibold text-foreground">No hiring data yet</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Start by creating roles and adding candidates to see hiring insights and analytics here.
              </p>
              <Link
                href="/recruit/roles/new"
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Create your first role
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
