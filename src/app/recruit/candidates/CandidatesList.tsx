"use client";

import { useMemo, useState, useTransition, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Plus,
  Search,
  Sparkles,
  UserSearch,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AskAIButton } from "@/components/shared/ask-ai-button";
import { Pagination } from "@/components/shared/pagination";
import { useEntityEvent } from "@/hooks/use-entity-event";
import { listCandidates, searchCandidates, listCandidateActivePipelines } from "@/actions/candidates";
import { serializeCandidatesList } from "./serialize";
import type { SerializedCandidate, CandidatesPageProps, CandidateCounts } from "./serialize";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PAGE_SIZE = 25;

/* -- Helpers --------------------------------------------------------- */

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "—";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function scoreColor(score: number | null) {
  if (score === null) return "text-muted-foreground/60 bg-muted border-border";
  if (score >= 80) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (score >= 60) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-foreground/70 bg-secondary border-border";
}

function searchStrengthLabel(score: number) {
  if (score >= 0.7) return "Strong";
  if (score >= 0.4) return "Good";
  return "Weak";
}

function searchStrengthClass(score: number) {
  if (score >= 0.7) return "bg-emerald-100 text-emerald-800";
  if (score >= 0.4) return "bg-blue-100 text-blue-800";
  return "bg-secondary text-secondary-foreground";
}

/* -- Filter chip ------------------------------------------------------ */

function ChipButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors whitespace-nowrap",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}

type CandidateFilter = "in_pipeline" | "new_this_week" | null;

/* -- Row ------------------------------------------------------------- */

function CandidateRow({ candidate }: { candidate: SerializedCandidate }) {
  const subtitleParts: string[] = [];
  if (candidate.title) subtitleParts.push(candidate.title);
  else if (!candidate.company) subtitleParts.push("No title");
  if (candidate.company) subtitleParts.push(`at ${candidate.company}`);
  if (candidate.location) subtitleParts.push(candidate.location);
  const subtitle = subtitleParts.join(" · ");

  return (
    <Link
      href={`/recruit/candidates/${candidate.id}`}
      className="group block border-b border-border/60 last:border-b-0 px-5 py-2.5 hover:bg-secondary/30 transition-colors"
    >
      <div className="flex items-center gap-4">
        {/* Title cluster */}
        <div className="flex items-center gap-2 min-w-0 shrink-0 max-w-[40%]">
          <span className="text-sm font-semibold text-foreground truncate">{candidate.name}</span>
          {candidate.activePipelines > 0 && (
            <span
              className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[9px] font-semibold text-emerald-700 shrink-0"
              title={candidate.activeRole ? `In pipeline for ${candidate.activeRole}` : "In an active pipeline"}
            >
              In pipeline
            </span>
          )}
          {candidate.isNew && (
            <span className="text-[11px] shrink-0" title="Added this week">✨</span>
          )}
          {candidate.searchScore !== null && (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold shrink-0",
                searchStrengthClass(candidate.searchScore),
              )}
              title={`Search match: ${searchStrengthLabel(candidate.searchScore)}`}
            >
              {searchStrengthLabel(candidate.searchScore)}
            </span>
          )}
        </div>

        {/* Subtitle — middle column, truncates first */}
        <span className="hidden md:block text-[11px] text-muted-foreground min-w-0 flex-1 truncate" title={subtitle}>
          {subtitle}
        </span>

        {/* Right rail: score · activity · chevron */}
        <div className="flex items-center gap-4 shrink-0">
          {candidate.talentScore !== null && (
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded border font-semibold tabular-nums",
                scoreColor(candidate.talentScore),
              )}
              title={`Talent score: ${candidate.talentScore}`}
            >
              {candidate.talentScore}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap min-w-[2.5rem] text-right">
            {relativeTime(candidate.updatedAt)}
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
        </div>
      </div>

      {/* Summary line — only when present */}
      {candidate.summary && (
        <p
          className="mt-1 text-[11px] text-muted-foreground/90 line-clamp-1"
          title={candidate.summary}
        >
          {candidate.summary}
        </p>
      )}
    </Link>
  );
}

/* -- Component ------------------------------------------------------- */

type SortKey = "lastActivity" | "newest" | "name" | "score";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "lastActivity", label: "Sort: Last activity ↓" },
  { value: "newest", label: "Sort: Newest ↓" },
  { value: "score", label: "Sort: Talent score ↓" },
  { value: "name", label: "Sort: Name A→Z" },
];

export default function CandidatesClient({
  candidates: initialCandidates,
  total: initialTotal,
  counts: initialCounts,
}: CandidatesPageProps) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [total, setTotal] = useState(initialTotal);
  const [counts, setCounts] = useState<CandidateCounts>(initialCounts);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [filter, setFilter] = useState<CandidateFilter>(null);
  const [sortKey, setSortKey] = useState<SortKey>("lastActivity");
  const [isPending, startTransition] = useTransition();
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;

  const fetchPage = useCallback((page: number, query: string) => {
    startTransition(async () => {
      const offset = (page - 1) * PAGE_SIZE;
      const [result, pipelineMap] = await Promise.all([
        query.trim()
          ? searchCandidates(query, { offset, limit: PAGE_SIZE })
          : listCandidates({ offset, limit: PAGE_SIZE }),
        listCandidateActivePipelines(),
      ]);
      const props = serializeCandidatesList(result.items as any, pipelineMap, result.total);
      setCandidates(props.candidates);
      setTotal(props.total);
      setCounts(props.counts);
    });
  }, []);

  useEntityEvent(["candidate", "application", "match"], undefined, () => {
    fetchPage(currentPageRef.current, searchQueryRef.current);
  });

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (!value.trim()) {
      setCurrentPage(1);
      fetchPage(1, "");
    } else if (value.endsWith(" ")) {
      setCurrentPage(1);
      fetchPage(1, value);
    }
  }, [fetchPage]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      setCurrentPage(1);
      fetchPage(1, searchQuery);
    }
  }, [fetchPage, searchQuery]);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    fetchPage(page, searchQuery);
  }, [fetchPage, searchQuery]);

  // Client-side filter + sort. Server returns the page; we narrow in-memory
  // so chip toggling and sort don't roundtrip.
  const visibleCandidates = useMemo(() => {
    let rows = candidates;
    if (filter === "in_pipeline") rows = rows.filter((c) => c.activePipelines > 0);
    else if (filter === "new_this_week") rows = rows.filter((c) => c.isNew);

    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "lastActivity": return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case "newest": return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "score": return (b.talentScore ?? -1) - (a.talentScore ?? -1);
        case "name": return a.name.localeCompare(b.name);
      }
    });
  }, [candidates, filter, sortKey]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1600px] px-6 py-6">
        <div className="space-y-3">
          {/* Header — title + actions on one line */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-2 min-w-0">
              <UserSearch className="h-4 w-4 text-muted-foreground shrink-0 self-center" />
              <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
                {total.toLocaleString()} candidate{total === 1 ? "" : "s"}
              </h1>
              {counts.inPipeline > 0 && (
                <span className="text-xs font-semibold text-emerald-700 whitespace-nowrap">
                  · {counts.inPipeline} in pipeline
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <AskAIButton entity="candidate" view="list" />
              <Link
                id="tour-add-candidate"
                href="/recruit/candidates/new"
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-3 w-3" />
                Add candidate
              </Link>
            </div>
          </div>

          {/* Toolbar — chips + search + sort on one line */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
              {counts.inPipeline > 0 && (
                <ChipButton
                  active={filter === "in_pipeline"}
                  onClick={() => setFilter(filter === "in_pipeline" ? null : "in_pipeline")}
                >
                  In pipeline <span className="tabular-nums opacity-70">{counts.inPipeline}</span>
                </ChipButton>
              )}
              {counts.newThisWeek > 0 && (
                <ChipButton
                  active={filter === "new_this_week"}
                  onClick={() => setFilter(filter === "new_this_week" ? null : "new_this_week")}
                >
                  <Sparkles className="h-2.5 w-2.5" />
                  New this week <span className="tabular-nums opacity-70">{counts.newThisWeek}</span>
                </ChipButton>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search by name, title, company, skills…"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  className="h-8 pl-8 pr-7 text-xs"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleSearchChange("")}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger size="sm" className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* List */}
          {visibleCandidates.length > 0 ? (
            <div className={cn("border-t border-border", isPending && "opacity-60 transition-opacity")}>
              {visibleCandidates.map((c) => <CandidateRow key={c.id} candidate={c} />)}
            </div>
          ) : candidates.length === 0 && !searchQuery ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-12 text-center">
              <UserSearch className="h-6 w-6 text-muted-foreground/30" />
              <p className="text-xs font-semibold text-foreground">No candidates yet</p>
              <p className="text-xs text-muted-foreground">Candidates will appear here as they are sourced or added.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-12 text-center">
              <Search className="h-6 w-6 text-muted-foreground/30" />
              <p className="text-xs font-semibold text-foreground">
                {searchQuery ? `No candidates match "${searchQuery}"` : "No candidates match these filters"}
              </p>
              {filter && (
                <Button
                  variant="soft"
                  size="sm"
                  onClick={() => setFilter(null)}
                  className="text-[11px]"
                >
                  Clear filter
                </Button>
              )}
            </div>
          )}

          <Pagination
            page={currentPage}
            totalPages={totalPages}
            total={total}
            pageSize={PAGE_SIZE}
            isPending={isPending}
            label="candidates"
            onPageChange={handlePageChange}
          />
        </div>
      </div>
    </div>
  );
}
