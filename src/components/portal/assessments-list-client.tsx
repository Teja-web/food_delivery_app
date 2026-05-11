"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  Clock,
  CheckCircle2,
  BarChart3,
  Globe,
  FileText,
  Loader2,
  Play,
} from "lucide-react";
import { beginPublicAssessment } from "@/actions/portal";
import { Button } from "@/components/ui/button";

interface AssignedAssessment {
  attemptId: string;
  assessmentId: string;
  title: string;
  type: string | null;
  origin: string;
  status: string;
  score: number | null;
  deadlineAt: string | null;
  createdAt: string;
}

interface AvailableAssessment {
  assessmentId: string;
  title: string;
  type: string | null;
  description: string | null;
}

function statusConfig(status: string) {
  switch (status) {
    case "pending":
      return { label: "Pending", className: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock };
    case "in_progress":
      return { label: "In Progress", className: "bg-blue-50 text-blue-700 border-blue-200", icon: Play };
    case "completed":
      return { label: "Submitted", className: "bg-secondary text-muted-foreground border-border", icon: CheckCircle2 };
    case "evaluated":
      return { label: "Evaluated", className: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: BarChart3 };
    default:
      return { label: status, className: "bg-secondary text-muted-foreground border-border", icon: FileText };
  }
}

function typeLabel(type: string | null) {
  if (!type) return null;
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ");
}

function originBadge(origin: string) {
  switch (origin) {
    case "ai_practice": return { label: "Practice", className: "bg-violet-50 text-violet-700 border-violet-200" };
    case "ai_rapid_fire": return { label: "Rapid Fire", className: "bg-amber-50 text-amber-700 border-amber-200" };
    case "ai_mock_interview": return { label: "Mock Interview", className: "bg-blue-50 text-blue-700 border-blue-200" };
    default: return null;
  }
}

function deadlineUrgency(deadlineAt: string | null) {
  if (!deadlineAt) return null;
  const days = Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: "Overdue", className: "text-red-600" };
  if (days === 0) return { label: "Due today", className: "text-red-600" };
  if (days <= 2) return { label: `Due in ${days}d`, className: "text-amber-600" };
  return { label: `Due ${new Date(deadlineAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, className: "text-muted-foreground" };
}

export function AssessmentsListClient({
  assigned,
  available,
  basePath = "/assessments",
}: {
  assigned: AssignedAssessment[];
  available: AvailableAssessment[];
  basePath?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [startingId, setStartingId] = useState<string | null>(null);

  function handleTakeAssessment(attemptId: string) {
    router.push(`${basePath}/${attemptId}/take`);
  }

  function handleViewResults(attemptId: string) {
    router.push(`${basePath}/${attemptId}/results`);
  }

  function handleStartPublic(assessmentId: string) {
    setStartingId(assessmentId);
    startTransition(async () => {
      const attempt = await beginPublicAssessment(assessmentId);
      setStartingId(null);
      if (attempt) {
        router.push(`${basePath}/${attempt.id}/take`);
      }
    });
  }

  const isEmpty = assigned.length === 0 && available.length === 0;
  const pendingCount = assigned.filter((a) => a.status === "pending" || a.status === "in_progress").length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="space-y-8">
          {/* Header */}
          <div className="section-reveal">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Assessments
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {pendingCount > 0
                ? `${pendingCount} assessment${pendingCount > 1 ? "s" : ""} waiting for you`
                : "Complete assigned assessments and explore available ones"}
            </p>
          </div>

          {/* Empty state */}
          {isEmpty && (
            <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
              <div className="mx-auto">
                <ClipboardCheck className="mx-auto h-8 w-8 text-muted-foreground/30" />
                <p className="mt-3 text-sm font-semibold text-foreground">No assessments yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  When recruiters assign assessments to you, they&apos;ll appear here.
                </p>
              </div>
            </div>
          )}

          {/* Assigned assessments */}
          {assigned.length > 0 && (
            <section className="section-reveal" style={{ animationDelay: "100ms" }}>
              <h2 className="text-display-sm mb-4 text-foreground">Assigned to you</h2>
              <div className="space-y-3">
                {assigned.map((a, index) => {
                  const config = statusConfig(a.status);
                  const StatusIcon = config.icon;
                  const canTake = a.status === "pending" || a.status === "in_progress";
                  const hasResults = a.status === "completed" || a.status === "evaluated";
                  const deadline = deadlineUrgency(a.deadlineAt);

                  return (
                    <div
                      key={a.attemptId}
                      className="feed-item-enter overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-border hover:shadow-sm"
                      style={{ animationDelay: `${index * 60}ms` }}
                    >
                      <div className="flex items-center gap-4 px-5 py-4">
                        {/* Icon */}
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                          <StatusIcon className="h-5 w-5 text-muted-foreground" />
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-foreground truncate">
                              {a.title}
                            </h3>
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${config.className}`}>
                              {config.label}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-3">
                            {originBadge(a.origin) && (
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${originBadge(a.origin)!.className}`}>
                                {originBadge(a.origin)!.label}
                              </span>
                            )}
                            {a.type && (
                              <span className="text-xs text-muted-foreground">{typeLabel(a.type)}</span>
                            )}
                            {deadline && (
                              <span className={`flex items-center gap-1 text-xs ${deadline.className}`}>
                                <Clock className="h-3 w-3" />
                                {deadline.label}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right side: score or action */}
                        <div className="flex items-center gap-3 shrink-0">
                          {hasResults && a.score != null && (
                            <div className="text-right">
                              <p className="text-metric text-lg text-foreground">{a.score}%</p>
                              <p className="text-[9px] text-muted-foreground">score</p>
                            </div>
                          )}
                          {canTake && (
                            <Button
                              variant="default"
                              onClick={() => handleTakeAssessment(a.attemptId)}
                              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors hover:opacity-90"
                            >
                              <Play className="h-3 w-3" />
                              {a.status === "in_progress" ? "Continue" : "Take"}
                            </Button>
                          )}
                          {hasResults && (
                            <Link
                              href={`${basePath}/${a.attemptId}/results`}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                            >
                              View results
                              <ArrowRight className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Available public assessments */}
          {available.length > 0 && (
            <section className="section-reveal" style={{ animationDelay: "200ms" }}>
              <h2 className="text-display-sm mb-4 text-foreground">Available to explore</h2>
              <div className="space-y-3">
                {available.map((a, index) => (
                  <div
                    key={a.assessmentId}
                    className="feed-item-enter overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-border hover:shadow-sm"
                    style={{ animationDelay: `${index * 60}ms` }}
                  >
                    <div className="flex items-center gap-4 px-5 py-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                        <Globe className="h-5 w-5 text-muted-foreground" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground truncate">
                            {a.title}
                          </h3>
                          {a.type && (
                            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                              {typeLabel(a.type)}
                            </span>
                          )}
                        </div>
                        {a.description && (
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                            {a.description}
                          </p>
                        )}
                      </div>

                      <Button
                        variant="soft"
                        onClick={() => handleStartPublic(a.assessmentId)}
                        disabled={isPending && startingId === a.assessmentId}
                        className="shrink-0 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {isPending && startingId === a.assessmentId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                        Start
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Bottom note */}
          {!isEmpty && (
            <div className="section-reveal flex items-start gap-3 rounded-xl border border-dashed border-border bg-card/50 p-5" style={{ animationDelay: "300ms" }}>
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-[10px]">
                ✦
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Results are analyzed automatically
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  After you submit, our AI evaluates your responses and generates
                  personalized feedback. Results typically appear within minutes.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
