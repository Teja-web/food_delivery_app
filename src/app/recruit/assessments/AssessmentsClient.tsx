"use client";

import { useState, useTransition, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ChevronRight,
  ClipboardCheck,
  Clock,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AskAIButton } from "@/components/shared/ask-ai-button";
import { Pagination } from "@/components/shared/pagination";
import { useEntityEvent } from "@/hooks/use-entity-event";
import { listAssessments, listAssessmentAttempts, fetchAssessmentStats } from "@/actions/assessments";
import { serializeAssessment, serializeAttempt } from "./serialize";
import type { AssessmentsPageProps, SerializedAssessment, SerializedAttempt, AssessmentType, AttemptStatus } from "./serialize";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 25;

function typeColor(type: AssessmentType | null) {
  switch (type) {
    case "case_study": return "text-amber-700 bg-amber-50 border-amber-200";
    case "interview_rubric": return "text-rose-700 bg-rose-50 border-rose-200";
    case "coding": return "text-blue-700 bg-blue-50 border-blue-200";
    case "technical": return "text-purple-700 bg-purple-50 border-purple-200";
    case "personality": return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "aptitude": return "text-cyan-700 bg-cyan-50 border-cyan-200";
    default: return "text-muted-foreground bg-secondary border-border";
  }
}

function typeLabel(type: AssessmentType | null) {
  switch (type) {
    case "case_study": return "Case Study";
    case "interview_rubric": return "Interview Rubric";
    case "coding": return "Coding";
    case "technical": return "Technical";
    case "personality": return "Personality";
    case "aptitude": return "Aptitude";
    default: return type ?? "Other";
  }
}

function statusColor(status: AttemptStatus) {
  switch (status) {
    case "completed": return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "evaluated": return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "in-progress": return "text-amber-700 bg-amber-50 border-amber-200";
    case "submitted": return "text-amber-700 bg-amber-50 border-amber-200";
    case "pending": return "text-blue-700 bg-blue-50 border-blue-200";
    case "expired": return "text-red-700 bg-red-50 border-red-200";
    default: return "text-muted-foreground bg-secondary border-border";
  }
}

const TABS = ["Assessments", "Active"] as const;
type Tab = typeof TABS[number];

export default function AssessmentsClient({ assessments: initialAssessments, assessmentsTotal: initialAssessmentsTotal, attempts: initialAttempts, attemptsTotal: initialAttemptsTotal }: AssessmentsPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Assessments");
  const [searchQuery, setSearchQuery] = useState("");
  const [assessmentsList, setAssessmentsList] = useState(initialAssessments);
  const [assessmentsTotal, setAssessmentsTotal] = useState(initialAssessmentsTotal);
  const [assessmentsPage, setAssessmentsPage] = useState(1);
  const [attemptsList, setAttemptsList] = useState(initialAttempts);
  const [attemptsTotal, setAttemptsTotal] = useState(initialAttemptsTotal);
  const [attemptsPage, setAttemptsPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  const assessmentsTotalPages = Math.max(1, Math.ceil(assessmentsTotal / PAGE_SIZE));
  const attemptsTotalPages = Math.max(1, Math.ceil(attemptsTotal / PAGE_SIZE));
  const assessmentsPageRef = useRef(assessmentsPage);
  assessmentsPageRef.current = assessmentsPage;
  const attemptsPageRef = useRef(attemptsPage);
  attemptsPageRef.current = attemptsPage;

  const fetchAssessmentsPage = useCallback((page: number) => {
    startTransition(async () => {
      const offset = (page - 1) * PAGE_SIZE;
      const [result, statsMap] = await Promise.all([
        listAssessments({ offset, limit: PAGE_SIZE }),
        fetchAssessmentStats(),
      ]);
      const items = (result?.items ?? []) as any[];
      setAssessmentsList(items.map((a: any) => serializeAssessment(a, statsMap[a.id] ?? { completedCount: 0, avgScore: 0, activeCount: 0 })));
      setAssessmentsTotal(result?.total ?? items.length);
    });
  }, []);

  const fetchAttemptsPage = useCallback((page: number) => {
    startTransition(async () => {
      const offset = (page - 1) * PAGE_SIZE;
      const result = await listAssessmentAttempts({ offset, limit: PAGE_SIZE });
      const items = (result?.items ?? []) as any[];
      setAttemptsList(items.map((a: any) => serializeAttempt(a)));
      setAttemptsTotal(result?.total ?? items.length);
    });
  }, []);

  useEntityEvent(["assessment", "assessmentAttempt"], undefined, () => {
    fetchAssessmentsPage(assessmentsPageRef.current);
    fetchAttemptsPage(attemptsPageRef.current);
  });

  const filteredAssessments = assessmentsList.filter(
    (a) =>
      !searchQuery ||
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
  );

  const activeAttempts = attemptsList.filter((a) => a.status !== "completed");
  const activeCount = activeAttempts.length;
  const draftCount = assessmentsList.filter((a) => a.status === "draft").length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="space-y-6">
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <ClipboardCheck className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Assessments</span>
              </div>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
                {assessmentsTotal} assessments, {activeCount} active
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Assessments are assigned to candidates from the Pipeline tab on each role.
              </p>
              {draftCount > 0 && (
                <p className="mt-1.5 text-xs text-amber-600">
                  {draftCount} draft{draftCount > 1 ? "s" : ""}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <AskAIButton entity="assessment" view="list" />
              <Link
                id="tour-new-assessment"
                href="/recruit/assessments/new"
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-3 w-3" />
                New assessment
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
              {TABS.map((tab) => {
                const count = tab === "Assessments" ? assessmentsTotal : attemptsTotal;
                return (
                  <Button
                    key={tab}
                    variant="pill"
                    onClick={() => setActiveTab(tab)}
                    data-active={activeTab === tab || undefined}
                  >
                    {tab} <span className="tabular-nums">{count}</span>
                  </Button>
                );
              })}
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search assessments..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-[8px]">
                ✦
              </div>
              <p className="text-xs font-semibold text-foreground">How assessments work</p>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Assessments define the evaluation structure — questions, rubric, scoring, and format.
              When a recruiter advances a candidate, the system can auto-assign the appropriate assessment.
              Results flow back into the candidate&apos;s expanded row as evidence.
            </p>
          </div>

          {activeTab === "Assessments" && (
            <div className={cn("space-y-4", isPending && "opacity-60 transition-opacity")}>
              {filteredAssessments.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-12 text-center">
                  <ClipboardCheck className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm font-semibold text-foreground">No assessments yet</p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Create your first assessment to start evaluating candidates.
                  </p>
                  <Link
                    href="/recruit/assessments/new"
                    className="mt-2 flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    <Plus className="h-3 w-3" />
                    New assessment
                  </Link>
                </div>
              ) : (
                <>
                  {filteredAssessments.map((assessment) => (
                    <AssessmentCard key={assessment.id} assessment={assessment} />
                  ))}
                  {!searchQuery && (
                    <Pagination page={assessmentsPage} totalPages={assessmentsTotalPages} total={assessmentsTotal} pageSize={PAGE_SIZE} isPending={isPending} label="assessments" onPageChange={(p) => { setAssessmentsPage(p); fetchAssessmentsPage(p); }} />
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === "Active" && (
            <div className={cn("space-y-4", isPending && "opacity-60 transition-opacity")}>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="grid grid-cols-[1fr_1fr_1fr_80px_80px_80px] gap-3 border-b border-border bg-secondary/50 px-5 py-2.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Candidate</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Role</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Assessment</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Assigned</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Due</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status</span>
              </div>
              {attemptsList.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <ClipboardCheck className="h-6 w-6 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">No active assessments</p>
                </div>
              ) : (
                attemptsList.map((attempt) => (
                  <Link
                    key={attempt.id}
                    href={`/recruit/assessments/${attempt.assessmentId}/results/${attempt.id}`}
                    className="grid grid-cols-[1fr_1fr_1fr_80px_80px_80px] gap-3 border-b border-border/60 px-5 py-3 last:border-b-0 hover:bg-secondary/20 transition-colors"
                  >
                    <p className="self-center text-xs font-semibold text-foreground truncate">{attempt.candidateName}</p>
                    <p className="self-center text-xs text-muted-foreground truncate">{attempt.roleName}</p>
                    <p className="self-center text-xs text-muted-foreground truncate">{attempt.assessmentTitle}</p>
                    <span className="self-center text-[11px] text-muted-foreground">{attempt.assignedAt ?? "-"}</span>
                    <span className="self-center text-[11px] text-muted-foreground">{attempt.deadlineAt ?? "-"}</span>
                    <span
                      className={cn(
                        "self-center rounded-full border px-2 py-0.5 text-[10px] font-semibold text-center capitalize",
                        attempt.waitingFor
                          ? "text-amber-700 bg-amber-50 border-amber-200"
                          : statusColor(attempt.status)
                      )}
                      title={
                        attempt.waitingFor === "transcript"
                          ? "Interview rubric — waiting for the call transcript. Resolves automatically once the interview ends."
                          : attempt.waitingFor === "interview_link"
                            ? "Interview rubric — no interview attached. Configure on the assessment."
                            : undefined
                      }
                    >
                      {attempt.waitingFor === "transcript"
                        ? "Awaiting transcript"
                        : attempt.waitingFor === "interview_link"
                          ? "Needs interview"
                          : attempt.status === "in-progress" ? "In progress" : attempt.status}
                    </span>
                  </Link>
                ))
              )}
            </div>
            <Pagination page={attemptsPage} totalPages={attemptsTotalPages} total={attemptsTotal} pageSize={PAGE_SIZE} isPending={isPending} label="attempts" onPageChange={(p) => { setAttemptsPage(p); fetchAttemptsPage(p); }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function assessmentStatusColor(status: string) {
  switch (status) {
    case "active": return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "archived": return "text-gray-500 bg-gray-50 border-gray-200";
    default: return "text-amber-700 bg-amber-50 border-amber-200";
  }
}

function AssessmentCard({ assessment }: { assessment: SerializedAssessment }) {
  const isDraft = assessment.status === "draft";

  return (
    <Link
      href={`/recruit/assessments/${assessment.id}`}
      className={cn(
        "block rounded-2xl border overflow-hidden transition-colors hover:border-primary/30",
        isDraft
          ? "border-amber-200 bg-card"
          : "border-border bg-card"
      )}
    >
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{assessment.title}</h3>
              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", assessmentStatusColor(assessment.status))}>
                {assessment.status === "active" ? "Active" : assessment.status === "archived" ? "Archived" : "Draft"}
              </span>
              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", typeColor(assessment.type))}>
                {typeLabel(assessment.type)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{assessment.description}</p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-center">
              <p className="text-sm font-semibold tabular-nums text-foreground">{assessment.completedCount}</p>
              <p className="text-[10px] text-muted-foreground">Completed</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold tabular-nums text-foreground">{assessment.avgScore || "-"}</p>
              <p className="text-[10px] text-muted-foreground">Avg score</p>
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{assessment.questionCount} questions</span>
        </div>
      </div>
      <div className="border-t border-border bg-secondary/30 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {assessment.activeCount > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-amber-500" />
              {assessment.activeCount} active
            </span>
          )}
          <span>Updated {assessment.updatedAt}</span>
        </div>
        <span
          onClick={(e) => {
            e.preventDefault();
            window.location.href = `/recruit/assessments/${assessment.id}/edit`;
          }}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          Edit
          <ChevronRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}
