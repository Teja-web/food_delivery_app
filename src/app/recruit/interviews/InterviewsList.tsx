"use client";

import { useState, useTransition, useCallback, useRef } from "react";
import Link from "next/link";
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  Search,
  Video,
  Phone,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AskAIButton } from "@/components/shared/ask-ai-button";
import { useEntityEvent } from "@/hooks/use-entity-event";
import { Pagination } from "@/components/shared/pagination";
import { listUpcomingInterviews, listPastInterviews } from "@/actions/interviews";
import { serializeListInterview } from "./serialize";
import type { SerializedListInterview, InterviewsListProps } from "./serialize";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/* -- Constants -------------------------------------------------------- */

const PAGE_SIZE = 25;

const INTERVIEW_TABS = ["Upcoming", "Past", "All"] as const;
type InterviewTab = (typeof INTERVIEW_TABS)[number];

/* -- Helpers ---------------------------------------------------------- */

function formatTime(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  // Normalize to start of day for accurate calendar day comparison
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((dDay.getTime() - nowDay.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatShortDate(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function typeIcon(type: string | null) {
  switch (type) {
    case "video_call": return Video;
    case "phone": return Phone;
    case "in_person": return Users;
    default: return Video;
  }
}

function typeLabel(type: string | null) {
  switch (type) {
    case "video_call": return "Video";
    case "phone": return "Phone";
    case "in_person": return "In person";
    default: return type || "Video";
  }
}

function statusConfig(status: string) {
  switch (status) {
    case "proposed": return { label: "Proposed", className: "border-amber-200 bg-amber-50 text-amber-700" };
    case "confirmed": return { label: "Confirmed", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
    case "completed": return { label: "Completed", className: "border-sky-200 bg-sky-50 text-sky-700" };
    case "cancelled": return { label: "Cancelled", className: "border-red-200 bg-red-50 text-red-600" };
    default: return { label: status, className: "border-border bg-secondary text-muted-foreground" };
  }
}

/* -- Interview Row ---------------------------------------------------- */

function InterviewRow({ interview: iv, variant }: { interview: SerializedListInterview; variant: "upcoming" | "past" }) {
  const TypeIcon = typeIcon(iv.interviewType);
  const status = statusConfig(iv.status);

  return (
    <Link
      href={`/recruit/interviews/${iv.id}`}
      className="block border-b border-border/60 last:border-b-0"
    >
      <div
        className="flex w-full items-center gap-4 px-5 py-3.5 hover:bg-secondary/20 transition-colors cursor-pointer"
      >
        {/* Time block */}
        <div className="shrink-0 w-16 text-center">
          {iv.scheduledAt ? (
            <>
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {variant === "upcoming" ? formatTime(iv.scheduledAt) : formatShortDate(iv.scheduledAt)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {variant === "upcoming" ? `${iv.durationMins || 45} min` : formatTime(iv.scheduledAt)}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">TBD</p>
          )}
        </div>

        {/* Divider */}
        <div className="h-10 w-px bg-border shrink-0" />

        {/* Main content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {iv.candidateName || "TBD"}
            </span>
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", status.className)}>
              {status.label}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {iv.roleName || "Unknown role"}
            {iv.panelistNames.length > 0 ? ` · with ${iv.panelistNames.join(", ")}` : ""}
          </p>
        </div>

        {/* Right side meta */}
        <div className="flex items-center gap-3 shrink-0">
          {iv.interviewType && (
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
              <TypeIcon className="h-3 w-3" />
              {typeLabel(iv.interviewType)}
            </span>
          )}
          {variant === "upcoming" && iv.scheduledAt && (
            <span className="hidden md:block text-[10px] text-muted-foreground w-20 text-right">
              {formatDate(iv.scheduledAt)}
            </span>
          )}
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>
    </Link>
  );
}

/* -- Component -------------------------------------------------------- */

export default function InterviewsClient({ upcoming, upcomingTotal: initialUpcomingTotal, past, pastTotal: initialPastTotal }: InterviewsListProps) {
  const [activeTab, setActiveTab] = useState<InterviewTab>("Upcoming");
  const [upcomingList, setUpcomingList] = useState(upcoming);
  const [upcomingTotal, setUpcomingTotal] = useState(initialUpcomingTotal);
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [pastList, setPastList] = useState(past);
  const [pastTotal, setPastTotal] = useState(initialPastTotal);
  const [pastPage, setPastPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  const upcomingTotalPages = Math.max(1, Math.ceil(upcomingTotal / PAGE_SIZE));
  const pastTotalPages = Math.max(1, Math.ceil(pastTotal / PAGE_SIZE));
  const upcomingPageRef = useRef(upcomingPage);
  upcomingPageRef.current = upcomingPage;
  const pastPageRef = useRef(pastPage);
  pastPageRef.current = pastPage;

  const fetchUpcomingPage = useCallback((page: number) => {
    startTransition(async () => {
      const offset = (page - 1) * PAGE_SIZE;
      const result = await listUpcomingInterviews({ offset, limit: PAGE_SIZE });
      setUpcomingList(result.items.map((iv: any) => serializeListInterview(iv)));
      setUpcomingTotal(result.total);
    });
  }, []);

  const fetchPastPage = useCallback((page: number) => {
    startTransition(async () => {
      const offset = (page - 1) * PAGE_SIZE;
      const result = await listPastInterviews({ offset, limit: PAGE_SIZE });
      setPastList(result.items.map((iv: any) => serializeListInterview(iv)));
      setPastTotal(result.total);
    });
  }, []);

  const handleUpcomingPageChange = useCallback((page: number) => {
    setUpcomingPage(page);
    fetchUpcomingPage(page);
  }, [fetchUpcomingPage]);

  const handlePastPageChange = useCallback((page: number) => {
    setPastPage(page);
    fetchPastPage(page);
  }, [fetchPastPage]);

  useEntityEvent("interview", undefined, () => {
    fetchUpcomingPage(upcomingPageRef.current);
    fetchPastPage(pastPageRef.current);
  });

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    // Search not paginated yet — reset to page 1 on search clear
    if (!value.trim()) {
      setUpcomingPage(1);
      setPastPage(1);
      fetchUpcomingPage(1);
      fetchPastPage(1);
    }
  }, [fetchUpcomingPage, fetchPastPage]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !searchQuery.trim()) {
      setUpcomingPage(1);
      setPastPage(1);
      fetchUpcomingPage(1);
      fetchPastPage(1);
    }
  }, [fetchUpcomingPage, fetchPastPage, searchQuery]);

  const showUpcoming = activeTab === "Upcoming" || activeTab === "All";
  const showPast = activeTab === "Past" || activeTab === "All";

  // Group upcoming interviews by day
  const grouped: Record<string, SerializedListInterview[]> = {};
  for (const iv of upcomingList) {
    const dayLabel = iv.scheduledAt ? formatDate(iv.scheduledAt) : "Unscheduled";
    if (!grouped[dayLabel]) grouped[dayLabel] = [];
    grouped[dayLabel].push(iv);
  }
  const groups = Object.entries(grouped).map(([label, interviews]) => ({ label, interviews }));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarClock className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Interviews</span>
              </div>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
                {upcomingTotal} upcoming, {pastTotal} completed
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Organized by evidence collection, not just calendar slots.
              </p>
            </div>
            <AskAIButton entity="interview" view="list" />
          </div>

          {/* Search + tabs */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search candidates, roles, interviewers..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-8 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleSearchChange("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
              {INTERVIEW_TABS.map((tab) => {
                const count = tab === "Upcoming" ? upcomingTotal : tab === "Past" ? pastTotal : upcomingTotal + pastTotal;
                return (
                  <Button
                    variant="pill"
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    data-active={activeTab === tab || undefined}
                  >
                    {tab} <span className="tabular-nums">{count}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Upcoming interviews — grouped by day */}
          {showUpcoming && groups.length > 0 && groups.map((group) => (
            <section key={group.label}>
              <h2 className="mb-3 text-sm font-semibold text-foreground">{group.label}</h2>
              <div className={cn("rounded-xl border border-border bg-card overflow-hidden", isPending && "opacity-60 transition-opacity")}>
                {group.interviews.map((iv) => (
                  <InterviewRow key={iv.id} interview={iv} variant="upcoming" />
                ))}
              </div>
            </section>
          ))}

          {showUpcoming && upcomingList.length > 0 && (
            <Pagination page={upcomingPage} totalPages={upcomingTotalPages} total={upcomingTotal} pageSize={PAGE_SIZE} isPending={isPending} label="upcoming" onPageChange={handleUpcomingPageChange} />
          )}

          {showUpcoming && upcomingList.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-8 text-center">
              {isPending ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <CalendarClock className="h-6 w-6 text-muted-foreground/30" />
                  <p className="text-xs font-semibold text-foreground">No upcoming interviews</p>
                  <p className="text-xs text-muted-foreground">Scheduled interviews will appear here.</p>
                </>
              )}
            </div>
          )}

          {/* Past interviews — unified row layout */}
          {showPast && pastList.length > 0 && (
            <section>
              {activeTab === "All" && <h2 className="mb-3 text-sm font-semibold text-foreground">Completed</h2>}
              <div className={cn("rounded-xl border border-border bg-card overflow-hidden", isPending && "opacity-60 transition-opacity")}>
                {pastList.map((iv) => (
                  <InterviewRow key={iv.id} interview={iv} variant="past" />
                ))}
              </div>
            </section>
          )}

          {showPast && pastList.length > 0 && (
            <Pagination page={pastPage} totalPages={pastTotalPages} total={pastTotal} pageSize={PAGE_SIZE} isPending={isPending} label="past" onPageChange={handlePastPageChange} />
          )}

          {showPast && pastList.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-8 text-center">
              {isPending ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Clock className="h-6 w-6 text-muted-foreground/30" />
                  <p className="text-xs font-semibold text-foreground">No past interviews</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
