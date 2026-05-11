"use client";

import { useMemo, useState, useTransition, useCallback, useRef } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  Briefcase,
  ChevronRight,
  CircleAlert,
  Lightbulb,
  Plus,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AskAIButton } from "@/components/shared/ask-ai-button";
import { Pagination } from "@/components/shared/pagination";
import { useEntityEvent } from "@/hooks/use-entity-event";
import { searchRoles, listOpenRoles } from "@/actions/roles";
import { fetchRoleFulfilments } from "@/actions/triage";
import { formatCompensationRange } from "@/lib/format-compensation";
import { serializeListRole } from "./serialize";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type {
  SerializedListRole,
  RolesListClientProps,
  AttentionReason,
} from "./serialize";

type RoleData = SerializedListRole;

/* -- Helpers --------------------------------------------------------- */

function daysOpen(createdAt: string) {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function healthDot(health: string | null) {
  switch (health) {
    case "on-track": return "bg-emerald-500";
    case "at-risk": return "bg-amber-500";
    case "stalled": return "bg-red-500";
    case "new": return "bg-blue-500";
    default: return "bg-muted-foreground";
  }
}

function healthLabel(health: string | null) {
  switch (health) {
    case "on-track": return "On track";
    case "at-risk": return "At risk";
    case "stalled": return "Stalled";
    case "new": return "New";
    default: return health || "Unknown";
  }
}

function formatComp(comp: RoleData["compensation"]) {
  return formatCompensationRange(comp);
}

function formatTargetDate(targetHireDate: string | null) {
  if (!targetHireDate) return null;
  const target = new Date(targetHireDate);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, color: "text-red-600" };
  if (diffDays <= 14) return { label: `due in ${diffDays}d`, color: "text-amber-700" };
  return { label: `due ${target.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, color: "text-muted-foreground" };
}

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

/* -- Filter definitions ---------------------------------------------- */

const HEALTH_FILTERS = [
  { id: "on-track", label: "On track", dot: "bg-emerald-500" },
  { id: "at-risk", label: "At risk", dot: "bg-amber-500" },
  { id: "stalled", label: "Stalled", dot: "bg-red-500" },
  { id: "new", label: "New", dot: "bg-blue-500" },
] as const;

const ATTENTION_FILTERS: { id: AttentionReason; label: string; emoji: string }[] = [
  { id: "decide", label: "Decide", emoji: "⚡" },
  { id: "stalled", label: "Stalled", emoji: "⏳" },
  { id: "due_soon", label: "Due soon", emoji: "📅" },
  { id: "no_candidates", label: "No candidates", emoji: "🚫" },
];

const ATTENTION_META: Record<AttentionReason, { emoji: string; tone: string }> = {
  decide: { emoji: "⚡", tone: "text-amber-600" },
  stalled: { emoji: "⏳", tone: "text-red-600" },
  due_soon: { emoji: "📅", tone: "text-amber-700" },
  no_candidates: { emoji: "🚫", tone: "text-muted-foreground" },
};

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

/* -- Pipeline summary (textual) -------------------------------------- */

function PipelineSummary({ counts }: { counts: RoleData["stageCounts"] }) {
  const segments = [
    { key: "sourced" as const, label: "sourced", tone: "text-foreground" },
    { key: "interview" as const, label: "interview", tone: "text-primary" },
    { key: "offer" as const, label: "offer", tone: "text-emerald-700" },
  ];
  const populated = segments.filter((s) => counts[s.key] > 0);
  if (populated.length === 0) {
    return <span className="text-[11px] text-muted-foreground italic whitespace-nowrap">no candidates</span>;
  }
  return (
    <span className="text-[11px] whitespace-nowrap">
      {populated.map((s, i) => (
        <span key={s.key}>
          {i > 0 && <span className="text-muted-foreground/40 mx-1">·</span>}
          <span className={cn("font-semibold tabular-nums", s.tone)}>{counts[s.key]}</span>
          <span className="text-muted-foreground"> {s.label}</span>
        </span>
      ))}
    </span>
  );
}

/* -- Fulfilment inline summary --------------------------------------- */

function FulfilmentInline({ fulfilment }: { fulfilment: NonNullable<RoleData["fulfilment"]> }) {
  const isHigh = fulfilment.urgency === "high" || fulfilment.urgency === "critical";
  const isMedium = fulfilment.urgency === "medium";
  const Icon = isHigh ? AlertTriangle : isMedium ? CircleAlert : Lightbulb;
  const tone = isHigh ? "text-red-600" : isMedium ? "text-amber-600" : "text-amber-500";
  return (
    <span className="flex items-center gap-1.5 text-[11px]">
      <Icon className={cn("h-3 w-3 shrink-0", tone)} />
      <span className="truncate text-foreground/80">
        {fulfilment.title}
        {fulfilment.action && (
          <span className="text-muted-foreground"> — {fulfilment.action}</span>
        )}
      </span>
    </span>
  );
}

/* -- Role row -------------------------------------------------------- */

function PersonChip({ role: roleLabel, name }: { role: string; name: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" title={`${roleLabel === "HM" ? "Hiring manager" : "Recruiter"}: ${name}`}>
      <span className="rounded bg-foreground/5 px-1 py-0 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
        {roleLabel}
      </span>
      <span className="text-foreground/80">{name}</span>
    </span>
  );
}

function RoleRow({ role }: { role: RoleData }) {
  const days = daysOpen(role.createdAt);
  const target = formatTargetDate(role.targetHireDate);
  // Plain meta (team / location / days / comp) — joined as text.
  const plainMeta: string[] = [];
  if (role.team) plainMeta.push(role.team);
  if (role.location) plainMeta.push(role.location);
  plainMeta.push(`${days}d open`);
  if (role.compensation) {
    const comp = formatComp(role.compensation);
    if (comp) plainMeta.push(comp);
  }
  const plainMetaText = plainMeta.join(" · ");
  const metaTooltip = [
    plainMetaText,
    role.hiringManagerName ? `HM: ${role.hiringManagerName}` : null,
    role.recruiterName ? `R: ${role.recruiterName}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <Link
      href={`/recruit/roles/${role.id}`}
      className="group block border-b border-border/60 last:border-b-0 px-5 py-2.5 hover:bg-secondary/30 transition-colors"
    >
      <div className="flex items-center gap-4">
        {/* Title cluster — fixed-fitting */}
        <div className="flex items-center gap-2 min-w-0 shrink-0 max-w-[40%]">
          <span
            className={cn("h-1.5 w-1.5 rounded-full shrink-0", healthDot(role.health))}
            title={healthLabel(role.health)}
          />
          <span className="text-sm font-semibold text-foreground truncate">{role.title}</span>
          {(role.headcount || 1) > 1 && (
            <span className="rounded-full border border-border px-1.5 py-0 text-[9px] font-medium tabular-nums text-muted-foreground shrink-0">
              {role.headcount} hires
            </span>
          )}
          {role.attentionReasons.map((r) => (
            <span
              key={r}
              title={ATTENTION_FILTERS.find((f) => f.id === r)?.label}
              className={cn("text-[11px] shrink-0", ATTENTION_META[r].tone)}
            >
              {ATTENTION_META[r].emoji}
            </span>
          ))}
        </div>

        {/* Meta — middle column, flex + truncate so it shrinks first */}
        <div
          className="hidden md:flex items-center gap-2 text-[11px] text-muted-foreground min-w-0 flex-1 overflow-hidden"
          title={metaTooltip}
        >
          <span className="truncate">{plainMetaText}</span>
          {(role.hiringManagerName || role.recruiterName) && (
            <span className="text-muted-foreground/30 shrink-0">·</span>
          )}
          {role.hiringManagerName && <PersonChip role="HM" name={role.hiringManagerName} />}
          {role.hiringManagerName && role.recruiterName && (
            <span className="text-muted-foreground/30 shrink-0">·</span>
          )}
          {role.recruiterName && <PersonChip role="R" name={role.recruiterName} />}
        </div>

        {/* Right rail: pipeline · activity · chevron */}
        <div className="flex items-center gap-4 shrink-0">
          <PipelineSummary counts={role.stageCounts} />
          <div className="flex flex-col items-end gap-0.5 min-w-[4rem] text-right">
            {target && (
              <span className={cn("text-[10px] font-semibold whitespace-nowrap", target.color)}>{target.label}</span>
            )}
            <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
              active {relativeTime(role.lastActivityAt)}
            </span>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
        </div>
      </div>

      {/* Fulfilment line — only when present */}
      {role.fulfilment && (
        <div className="mt-1 ml-3.5">
          <FulfilmentInline fulfilment={role.fulfilment} />
        </div>
      )}
    </Link>
  );
}

/* -- Component ------------------------------------------------------- */

const PAGE_SIZE = 25;

type SortKey = "urgency" | "newest" | "lastActivity" | "daysOpen" | "title";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "urgency", label: "Sort: Most urgent ↓" },
  { value: "newest", label: "Sort: Newest ↓" },
  { value: "lastActivity", label: "Sort: Last activity ↓" },
  { value: "daysOpen", label: "Sort: Days open ↓" },
  { value: "title", label: "Sort: Title A→Z" },
];

export default function RolesClient({ roles: initialOpen, openTotal: initialOpenTotal }: RolesListClientProps) {
  const [openRoles, setOpenRoles] = useState(initialOpen);
  const [openTotal, setOpenTotal] = useState(initialOpenTotal);
  const [openPage, setOpenPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [healthFilter, setHealthFilter] = useState<string | null>(null);
  const [attentionFilter, setAttentionFilter] = useState<AttentionReason | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("urgency");
  const [isPending, startTransition] = useTransition();

  const openTotalPages = Math.max(1, Math.ceil(openTotal / PAGE_SIZE));
  const openPageRef = useRef(openPage);
  openPageRef.current = openPage;
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;

  const fetchOpenPage = useCallback((page: number, query?: string) => {
    startTransition(async () => {
      const offset = (page - 1) * PAGE_SIZE;
      const q = query ?? searchQueryRef.current;
      const result = q.trim()
        ? await searchRoles(q, { offset, limit: PAGE_SIZE })
        : await listOpenRoles({ offset, limit: PAGE_SIZE });
      const items = result.items as any[];
      const filtered = q.trim()
        ? items.filter((r) => r.status === "open" || r.status === "draft")
        : items;
      const fulfilments = await fetchRoleFulfilments(filtered.map((r) => r.id));
      setOpenRoles(filtered.map((r) => serializeListRole(r, fulfilments[r.id] ?? null)));
      setOpenTotal(result.total);
    });
  }, []);

  const handleOpenPageChange = useCallback((page: number) => {
    setOpenPage(page);
    fetchOpenPage(page);
  }, [fetchOpenPage]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (!value.trim()) {
      setOpenPage(1);
      fetchOpenPage(1, "");
    } else if (value.endsWith(" ")) {
      setOpenPage(1);
      fetchOpenPage(1, value);
    }
  }, [fetchOpenPage]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      setOpenPage(1);
      fetchOpenPage(1, searchQuery);
    }
  }, [fetchOpenPage, searchQuery]);

  useEntityEvent(["role"], undefined, () => {
    fetchOpenPage(openPageRef.current);
  });

  // Client-side filter + sort. Server returns the page; we narrow + reorder
  // in-memory so chip toggling and sort don't roundtrip.
  const visibleRoles = useMemo(() => {
    let rows = openRoles;
    if (healthFilter) rows = rows.filter((r) => r.health === healthFilter);
    if (attentionFilter) rows = rows.filter((r) => r.attentionReasons.includes(attentionFilter));
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "urgency": return b.urgencyScore - a.urgencyScore;
        case "newest": return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "lastActivity": return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
        case "daysOpen": return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "title": return a.title.localeCompare(b.title);
      }
    });
  }, [openRoles, healthFilter, attentionFilter, sortKey]);

  // Counts for chip badges — based on the unfiltered current page.
  const healthCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of openRoles) {
      if (!r.health) continue;
      counts[r.health] = (counts[r.health] ?? 0) + 1;
    }
    return counts;
  }, [openRoles]);

  const attentionCounts = useMemo(() => {
    const counts: Record<AttentionReason, number> = { decide: 0, stalled: 0, due_soon: 0, no_candidates: 0 };
    for (const r of openRoles) {
      for (const reason of r.attentionReasons) counts[reason]++;
    }
    return counts;
  }, [openRoles]);

  const totalAttention = attentionCounts.decide + attentionCounts.stalled + attentionCounts.due_soon + attentionCounts.no_candidates;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1600px] px-6 py-6">
        <div className="space-y-3">
          {/* Header — title + actions on one line */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-2 min-w-0">
              <Briefcase className="h-4 w-4 text-muted-foreground shrink-0 self-center" />
              <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
                {openTotal} open {openTotal === 1 ? "role" : "roles"}
              </h1>
              {totalAttention > 0 && (
                <span className="text-xs font-semibold text-amber-600 whitespace-nowrap">
                  · {totalAttention} need attention
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/recruit/roles/archive"
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <Archive className="h-3 w-3" />
                Archive
              </Link>
              <AskAIButton entity="role" view="list" />
              <Link
                id="tour-add-role"
                href="/recruit/roles/new"
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-3 w-3" />
                New role
              </Link>
            </div>
          </div>

          {/* Toolbar — chips + search + sort on one line */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
              {HEALTH_FILTERS.map((f) => {
                const count = healthCounts[f.id] ?? 0;
                if (count === 0 && healthFilter !== f.id) return null;
                return (
                  <ChipButton
                    key={f.id}
                    active={healthFilter === f.id}
                    onClick={() => setHealthFilter(healthFilter === f.id ? null : f.id)}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", f.dot)} />
                    {f.label} <span className="tabular-nums opacity-70">{count}</span>
                  </ChipButton>
                );
              })}
              {totalAttention > 0 && <span className="h-5 w-px bg-border mx-1" />}
              {ATTENTION_FILTERS.map((f) => {
                const count = attentionCounts[f.id];
                if (count === 0 && attentionFilter !== f.id) return null;
                return (
                  <ChipButton
                    key={f.id}
                    active={attentionFilter === f.id}
                    onClick={() => setAttentionFilter(attentionFilter === f.id ? null : f.id)}
                  >
                    <span>{f.emoji}</span>
                    {f.label} <span className="tabular-nums opacity-70">{count}</span>
                  </ChipButton>
                );
              })}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search roles…"
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
          {visibleRoles.length > 0 ? (
            <div className={cn("border-t border-border", isPending && "opacity-60 transition-opacity")}>
              {visibleRoles.map((role) => (
                <RoleRow key={role.id} role={role} />
              ))}
            </div>
          ) : openRoles.length === 0 && !searchQuery ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-12 text-center">
              <Briefcase className="h-6 w-6 text-muted-foreground/30" />
              <p className="text-xs font-semibold text-foreground">No roles yet</p>
              <p className="text-xs text-muted-foreground">Create your first role to get started.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-12 text-center">
              <Search className="h-6 w-6 text-muted-foreground/30" />
              <p className="text-xs font-semibold text-foreground">
                {searchQuery ? `No roles match "${searchQuery}"` : "No roles match these filters"}
              </p>
              {(healthFilter || attentionFilter) && (
                <Button
                  variant="soft"
                  size="sm"
                  onClick={() => { setHealthFilter(null); setAttentionFilter(null); }}
                  className="text-[11px]"
                >
                  Clear filters
                </Button>
              )}
            </div>
          )}

          <Pagination
            page={openPage}
            totalPages={openTotalPages}
            total={openTotal}
            pageSize={PAGE_SIZE}
            isPending={isPending}
            label="open roles"
            onPageChange={handleOpenPageChange}
          />
        </div>
      </div>
    </div>
  );
}
