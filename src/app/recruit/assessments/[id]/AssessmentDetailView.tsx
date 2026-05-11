"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Edit3,
  FileText,
  Globe,
  Loader2,
  Lock,
  Search,
  Sparkles,
  UserPlus,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";
import { AskAIButton } from "@/components/shared/ask-ai-button";
import { listCandidates } from "@/actions/candidates";
import { addAssessmentAttempt, listAssessmentAttempts } from "@/actions/assessments";
import type { AssessmentAttempt } from "@/db/schema/assessments";
import type { SerializedAssessmentDetail } from "./serialize";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const QUESTION_TYPE_LABELS: Record<string, string> = {
  SHORT_TEXT: "Short Text",
  LONG_TEXT: "Long Text",
  MCQ: "Multiple Choice",
  MULTI_SELECT: "Multi Select",
  CODING_SNIPPET: "Coding",
  SCALE: "Scale",
  BOOLEAN: "Yes/No",
};

function typeColor(type: string | null) {
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

function typeLabel(type: string | null) {
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

function statusIcon(status: string) {
  switch (status) {
    case "completed":
    case "evaluated":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "submitted":
      return <Clock className="h-4 w-4 text-amber-500" />;
    case "in-progress":
      return <Clock className="h-4 w-4 text-blue-500" />;
    case "expired":
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function attemptStatusColor(status: string) {
  switch (status) {
    case "completed":
    case "evaluated":
      return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "submitted":
      return "text-amber-700 bg-amber-50 border-amber-200";
    case "in-progress":
      return "text-blue-700 bg-blue-50 border-blue-200";
    case "pending":
      return "text-muted-foreground bg-secondary border-border";
    case "expired":
      return "text-red-700 bg-red-50 border-red-200";
    default:
      return "text-muted-foreground bg-secondary border-border";
  }
}

function formatDate(d: string | Date | null): string {
  if (!d) return "-";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface Candidate {
  id: string;
  name: string;
  email: string | null;
  currentRole: string | null;
}

interface Attempt {
  id: string;
  candidateId: string;
  candidateName: string;
  status: string;
  score: number | null;
  assignedAt: string | null;
  submittedAt: string | null;
}

const TABS = ["Overview", "Results"] as const;
type Tab = typeof TABS[number];

interface Props extends SerializedAssessmentDetail {}

export default function AssessmentDetailView(props: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("Overview");

  // Assign dialog state
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [assignedCandidateIds, setAssignedCandidateIds] = useState<Set<string>>(new Set());
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Results/Evaluate state
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);

  useEffect(() => {
    if (showAssignDialog && candidates.length === 0) {
      loadCandidates();
    }
  }, [showAssignDialog]);

  // Load attempts on mount for Overview tab to show Assigned count
  useEffect(() => {
    loadAttempts();
  }, []);

  useEffect(() => {
    if (activeTab === "Results" && attempts.length === 0) {
      loadAttempts();
    }
  }, [activeTab]);

  const loadCandidates = async () => {
    setLoadingCandidates(true);
    try {
      const [candidatesResult, attemptsResult] = await Promise.all([
        listCandidates({ limit: 100 }),
        listAssessmentAttempts({ limit: 500 }),
      ]);

      // Handle both array and { items: [...] } return formats (CRUD factory returns { items, total })
      const candidatesData = Array.isArray(candidatesResult) ? candidatesResult : (candidatesResult as any)?.items ?? [];
      const attemptsData: AssessmentAttempt[] = Array.isArray(attemptsResult) ? attemptsResult : (attemptsResult as any)?.items ?? [];

      setCandidates(
        candidatesData.map((c: any) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          currentRole: c.currentRole,
        }))
      );

      const assigned = new Set<string>();
      for (const attempt of attemptsData as any[]) {
        if (attempt.assessmentId === props.id) {
          assigned.add(attempt.candidateId);
        }
      }
      setAssignedCandidateIds(assigned);
    } catch (err) {
      console.error("Failed to load candidates:", err);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const loadAttempts = async () => {
    setLoadingAttempts(true);
    try {
      const [attemptsResult, candidatesResult] = await Promise.all([
        listAssessmentAttempts({ limit: 500 }),
        listCandidates({ limit: 500 }),
      ]);

      // Handle both array and { items: [...] } return formats (CRUD factory returns { items, total })
      const attemptsData: AssessmentAttempt[] = Array.isArray(attemptsResult) ? attemptsResult : (attemptsResult as any)?.items ?? [];
      const candidatesData = Array.isArray(candidatesResult) ? candidatesResult : (candidatesResult as any)?.items ?? [];

      const candidateMap = new Map<string, string>();
      for (const c of candidatesData) {
        candidateMap.set(c.id, c.name);
      }

      const filtered = attemptsData
        .filter((a) => a.assessmentId === props.id)
        .map((a) => ({
          id: a.id,
          candidateId: a.candidateId,
          candidateName: candidateMap.get(a.candidateId) ?? "Unknown",
          status: a.status,
          score: a.score,
          assignedAt: a.createdAt.toISOString(),
          submittedAt: a.submittedAt?.toISOString() ?? null,
        }));

      setAttempts(filtered);
    } catch (err) {
      console.error("Failed to load attempts:", err);
    } finally {
      setLoadingAttempts(false);
    }
  };

  const filteredCandidates = candidates.filter(
    (c) =>
      !searchQuery ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.currentRole?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleCandidate = (candidateId: string) => {
    const newSelected = new Set(selectedCandidateIds);
    if (newSelected.has(candidateId)) {
      newSelected.delete(candidateId);
    } else {
      newSelected.add(candidateId);
    }
    setSelectedCandidateIds(newSelected);
  };

  const handleAssign = async () => {
    if (selectedCandidateIds.size === 0) return;
    setAssigning(true);

    try {
      const promises = Array.from(selectedCandidateIds).map((candidateId) =>
        addAssessmentAttempt({
          assessmentId: props.id,
          candidateId,
          status: "pending",
        })
      );
      await Promise.all(promises);
      setShowAssignDialog(false);
      setSelectedCandidateIds(new Set());
      // Reload attempts if on results tab
      if (activeTab === "Results") {
        loadAttempts();
      }
      router.refresh();
    } catch (err) {
      console.error("Failed to assign assessment:", err);
    } finally {
      setAssigning(false);
    }
  };

  const completedAttempts = attempts.filter((a) => a.status === "completed" || a.status === "evaluated");
  const avgScore = completedAttempts.length > 0
    ? Math.round(completedAttempts.reduce((sum, a) => sum + (a.score ?? 0), 0) / completedAttempts.length)
    : null;

  return (
    <>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <div className="space-y-6">
            <Link
              href="/recruit/assessments"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Assessments
            </Link>

            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <ClipboardCheck className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Assessment
                  </span>
                </div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                  {props.title}
                </h1>
                {props.description && (
                  <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
                    {props.description}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-semibold", typeColor(props.type))}>
                    {typeLabel(props.type)}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    {props.visibility === "private" ? (
                      <><Lock className="h-3 w-3" /> Private</>
                    ) : (
                      <><Globe className="h-3 w-3" /> Public</>
                    )}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <AskAIButton entity="assessment" id={props.id} view="detail" data={{...props}} />
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 text-[10px] font-semibold",
                    props.status === "active"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : props.status === "archived"
                      ? "border-gray-200 bg-gray-50 text-gray-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  )}
                >
                  {props.status === "active" ? "Active" : props.status === "archived" ? "Archived" : "Draft"}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setShowAssignDialog(true)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary/50 transition-colors"
                >
                  <UserPlus className="h-3 w-3" />
                  Assign
                </Button>
                <Link
                  href={`/recruit/assessments/${props.id}/edit`}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary/50 transition-colors"
                >
                  <Edit3 className="h-3 w-3" />
                  Edit
                </Link>
              </div>
            </div>

            {/* Draft Banner */}
            {props.status === "draft" && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 flex items-center gap-3">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <p className="flex-1 text-xs text-amber-700">
                  Not visible to candidates until activated.
                </p>
                <Link
                  href={`/recruit/assessments/${props.id}/edit`}
                  className="shrink-0 text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors underline underline-offset-2"
                >
                  {props.questionCount === 0 ? "Add questions" : "Activate"}
                </Link>
              </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-border">
              {TABS.map((tab) => (
                <Button
                  key={tab}
                  variant="ghost"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px",
                    activeTab === tab
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab}
                </Button>
              ))}
            </div>

            {/* Tab Content */}
            {activeTab === "Overview" && (
              <div className="space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Questions</p>
                    </div>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{props.questionCount}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Assigned</p>
                    </div>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{attempts.length || "-"}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Completed</p>
                    </div>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">{completedAttempts.length || "-"}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Avg Score</p>
                    </div>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{avgScore !== null ? `${avgScore}%` : "-"}</p>
                  </div>
                </div>

                {/* Questions Preview */}
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-foreground">
                    Questions ({props.questions.length})
                  </h2>

                  {props.questions.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
                      <FileText className="mx-auto h-8 w-8 text-muted-foreground/30" />
                      <p className="mt-2 text-sm font-medium text-foreground">No questions yet</p>
                      <p className="text-xs text-muted-foreground">
                        Click Edit to add questions
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
                      {props.questions.map((q, idx) => (
                        <div key={q.id} className="flex items-start gap-3 px-4 py-3">
                          <span className="text-xs font-medium text-muted-foreground w-6 mt-0.5 shrink-0">
                            {idx + 1}.
                          </span>
                          <Streamdown className="flex-1 prose prose-sm dark:prose-invert max-w-none prose-p:my-0 prose-p:text-foreground prose-strong:text-foreground prose-pre:my-1 prose-pre:bg-secondary prose-pre:text-foreground prose-pre:rounded-md prose-pre:p-2 prose-pre:text-xs [&_code:not(pre_code)]:text-[13px] [&_code:not(pre_code)]:text-pink-700 [&_code:not(pre_code)]:bg-pink-50 [&_code:not(pre_code)]:border [&_code:not(pre_code)]:border-pink-200 [&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:px-1 [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:font-semibold [&_code:not(pre_code)]:font-mono dark:[&_code:not(pre_code)]:text-pink-300 dark:[&_code:not(pre_code)]:bg-pink-950/60 dark:[&_code:not(pre_code)]:border-pink-700 text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" controls={{ code: false }}>
                            {q.text}
                          </Streamdown>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {QUESTION_TYPE_LABELS[q.type] ?? q.type}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {q.weight} pt{q.weight !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Meta */}
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground pt-4 border-t border-border">
                  <span>Created: {props.createdAt}</span>
                  <span>Updated: {props.updatedAt}</span>
                </div>
              </div>
            )}

            {activeTab === "Results" && (
              <div className="space-y-4">
                {loadingAttempts ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : attempts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
                    <Users className="mx-auto h-8 w-8 text-muted-foreground/30" />
                    <p className="mt-2 text-sm font-medium text-foreground">No candidates assigned yet</p>
                    <p className="text-xs text-muted-foreground">
                      Assign candidates to this assessment to see results
                    </p>
                    <Button
                      variant="link"
                      onClick={() => setShowAssignDialog(true)}
                      className="mt-3 inline-flex items-center gap-1 text-xs"
                    >
                      <UserPlus className="h-3 w-3" />
                      Assign candidates
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="grid grid-cols-[1fr_100px_80px_80px_80px_40px] gap-3 border-b border-border bg-secondary/50 px-5 py-2.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Candidate</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Assigned</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Submitted</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-right">Score</span>
                      <span></span>
                    </div>
                    {attempts.map((attempt) => (
                      <div
                        key={attempt.id}
                        className="grid grid-cols-[1fr_100px_80px_80px_80px_40px] gap-3 border-b border-border/60 px-5 py-3 last:border-b-0 hover:bg-secondary/20 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {statusIcon(attempt.status)}
                          <span className="text-sm font-medium text-foreground truncate">
                            {attempt.candidateName}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "self-center rounded-full border px-2 py-0.5 text-[10px] font-semibold text-center capitalize w-fit",
                            attemptStatusColor(attempt.status)
                          )}
                        >
                          {attempt.status === "in-progress" ? "In progress" : attempt.status}
                        </span>
                        <span className="self-center text-[11px] text-muted-foreground">
                          {formatDate(attempt.assignedAt)}
                        </span>
                        <span className="self-center text-[11px] text-muted-foreground">
                          {formatDate(attempt.submittedAt)}
                        </span>
                        <span className="self-center text-sm font-semibold tabular-nums text-foreground text-right">
                          {attempt.score !== null ? `${attempt.score}%` : "-"}
                        </span>
                        <Link
                          href={`/recruit/assessments/${props.id}/results/${attempt.id}`}
                          className="self-center text-muted-foreground hover:text-foreground"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Assign Dialog */}
      {showAssignDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowAssignDialog(false)}
          />
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Assign Assessment</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select candidates to assign this assessment to
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setShowAssignDialog(false)}
                className="rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="px-5 py-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search candidates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingCandidates ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredCandidates.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <Users className="h-6 w-6 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">No candidates found</p>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {filteredCandidates.map((candidate) => {
                    const isAssigned = assignedCandidateIds.has(candidate.id);
                    const isSelected = selectedCandidateIds.has(candidate.id);

                    return (
                      <Button
                        key={candidate.id}
                        type="button"
                        variant="ghost"
                        disabled={isAssigned}
                        onClick={() => toggleCandidate(candidate.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-5 py-3 text-left transition-colors",
                          isAssigned
                            ? "opacity-50 cursor-not-allowed bg-secondary/20"
                            : isSelected
                            ? "bg-primary/5"
                            : "hover:bg-secondary/30"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                            isAssigned
                              ? "border-emerald-300 bg-emerald-100"
                              : isSelected
                              ? "border-primary bg-primary"
                              : "border-border bg-background"
                          )}
                        >
                          {(isAssigned || isSelected) && (
                            <Check
                              className={cn(
                                "h-3 w-3",
                                isAssigned ? "text-emerald-600" : "text-primary-foreground"
                              )}
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {candidate.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {candidate.email ?? "No email"}
                            {candidate.currentRole && ` · ${candidate.currentRole}`}
                          </p>
                        </div>
                        {isAssigned && (
                          <span className="shrink-0 text-[10px] text-emerald-600 font-medium">
                            Assigned
                          </span>
                        )}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border px-5 py-4">
              <p className="text-xs text-muted-foreground">
                {selectedCandidateIds.size > 0 && `${selectedCandidateIds.size} selected`}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="soft"
                  onClick={() => setShowAssignDialog(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  onClick={handleAssign}
                  disabled={assigning || selectedCandidateIds.size === 0}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {assigning ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Assigning...
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-3 w-3" />
                      Assign
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
