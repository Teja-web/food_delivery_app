"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  ChevronRight,
  FileText,
  Flag,
  GitCompare,
  HandCoins,
  Pencil,
  RotateCcw,
  Share2,
  Sparkles,
  User,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompensationRange } from "@/lib/format-compensation";
import { AskAIButton } from "@/components/shared/ask-ai-button";
import { MatchCard } from "@/components/shared/match-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TriageItem } from "@/components/TriageItem";
import { CompareDrawer } from "./CompareDrawer";
import { SharePanel } from "./SharePanel";
import {
  addMatchToPipeline,
  dismissMatch,
  advanceApplication,
  editApplication,
  findMoreMatches,
  addMatchesToPipelineBatch,
  dismissMatchesBatch,
  editApplicationsBatch,
} from "@/actions/pipeline";
import { fetchApplicationsPage, fetchRecommendationsPage, fetchAllMatchingApplicationIds } from "@/actions/roles";
import { useRouter } from "next/navigation";
import { useEntityEvent } from "@/hooks/use-entity-event";
import { nextStage, isTerminalStage, type NextStageResult, STALE_THRESHOLD_DAYS } from "@/lib/pipeline-stage";
import { addEntityNoteBulk } from "@/actions/entity-notes";
import { EntityListDetail, Kbd } from "@/components/shared/entity-list-detail";
import { MatchRow } from "@/components/shared/match-row";
import { NotesPanel } from "@/components/shared/notes-panel";
import { UndoToast } from "@/components/shared/undo-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/* -- Types (derived from serialize.ts, which derives from Drizzle schema) -- */

import { EntityActivity } from "@/components/shared/entity-activity";
import type {
  RoleDetailProps,
  SerializedRole,
  SerializedApplication,
  SerializedRecommended,
  PipelineStage,
} from "./serialize";

type RoleDetailClientProps = RoleDetailProps;

/* -- Helpers --------------------------------------------------------- */

function healthColor(h: string | null) { return h === "on-track" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : h === "at-risk" ? "text-amber-700 bg-amber-50 border-amber-200" : h === "stalled" ? "text-red-600 bg-red-50 border-red-200" : "text-blue-700 bg-blue-50 border-blue-200"; }
function healthLabel(h: string | null) { return h === "on-track" ? "On track" : h === "at-risk" ? "At risk" : h === "stalled" ? "Stalled" : "New"; }

function daysOpen(createdAt: string) {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function formatComp(comp: SerializedRole["compensation"]) {
  return formatCompensationRange(comp);
}

function formatTime(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatRelativeDate(dateStr: string | null) {
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
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Debounce a value — returns the input after `ms` of stillness. */
function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

const PAGE_SIZE = 25;

const TABS = ["Pipeline", "Recommended", "Interviews", "Feed"] as const;

/* -- Pipeline wrapper ------------------------------------------------ */
// (inline MatchCard removed — now imported from @/components/shared/match-card)

type PrimaryAction = { label: string; icon?: React.ReactNode; onClick: () => void };

/**
 * Map a NextStageResult into the click-handler shape MatchCard expects.
 * Pure dispatch — kept here so navigation/server-action wiring stays in the component layer.
 */
function primaryActionFor(
  next: NextStageResult,
  entry: SerializedApplication,
  roleId: string,
  router: ReturnType<typeof useRouter>,
  startTransition: (cb: () => void | Promise<void>) => void,
): PrimaryAction | null {
  switch (next.kind) {
    case "restore":
      return {
        label: next.label,
        icon: <RotateCcw className="h-3 w-3" />,
        onClick: () => startTransition(async () => { await editApplication(entry.id, { stage: next.toStage }); }),
      };
    case "view-offer": {
      const offerUrl = next.offerId ? `/recruit/offers/${next.offerId}` : `/recruit/offers?applicationId=${entry.id}`;
      return { label: next.label, onClick: () => router.push(offerUrl) };
    }
    case "advance-to-offer":
      return {
        label: next.label,
        icon: <ArrowRight className="h-3 w-3" />,
        onClick: () => startTransition(async () => { await advanceApplication(entry.id, "offer"); }),
      };
    case "view-interview":
      return {
        label: next.label,
        icon: <CalendarClock className="h-3 w-3" />,
        onClick: () => router.push(`/recruit/interviews/${next.interviewId}`),
      };
    case "schedule":
      return {
        label: next.label,
        icon: <CalendarClock className="h-3 w-3" />,
        onClick: () => {
          // Navigate immediately; advance stage in background to avoid revalidation interrupting navigation.
          router.push(`/recruit/interviews/new?applicationId=${entry.id}&stageId=${next.stageId}&roleId=${roleId}`);
          if (entry.stage !== "interview") {
            startTransition(async () => { await advanceApplication(entry.id, "interview"); });
          }
        },
      };
    case "advance":
      return {
        label: next.label,
        icon: <ArrowRight className="h-3 w-3" />,
        onClick: () => startTransition(async () => { await advanceApplication(entry.id, next.toStage); }),
      };
    case "none":
      return null;
  }
}

/* -- Pipeline on shell ----------------------------------------------- */

function PipelineEntityList({
  initialItems,
  initialTotal,
  pipeline,
  smartCounts,
  roleId,
  roleTitle,
  stageFilter,
  onStageFilterChange,
  onTotalChange,
}: {
  initialItems: SerializedApplication[];
  initialTotal: number;
  pipeline: PipelineStage[];
  smartCounts?: { stale: number; decisionReady: number };
  roleId: string;
  roleTitle: string;
  stageFilter: string | null;
  onStageFilterChange: (value: string | null) => void;
  /** Fired whenever the wrapper's total changes — parent uses this for the tab counter. */
  onTotalChange?: (total: number) => void;
}) {
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  // Bubble total changes up to the parent (for tab counter sync).
  useEffect(() => { onTotalChange?.(total); }, [total, onTotalChange]);
  const setStageFilter = onStageFilterChange;
  const [smartFilter, setSmartFilter] = useState<"stale" | "decisionReady" | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 250);
  const [sortBy, setSortBy] = useState<"createdAt" | "daysInStage" | "updatedAt">("createdAt");
  const [bulkIds, setBulkIds] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(initialItems[0]?.id ?? null);
  const [showCompare, setShowCompare] = useState(false);
  const [showReject, setShowReject] = useState<{ ids: string[] } | null>(null);
  const [undoState, setUndoState] = useState<{
    key: number;
    message: string;
    onUndo: () => Promise<void>;
    skipped?: { id: string; reason: string }[];
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isLoadingMore, setLoadingMore] = useState(false);
  const router = useRouter();

  // Refetch on filter/sort change.
  useEffect(() => {
    startTransition(async () => {
      const result = await fetchApplicationsPage(roleId, {
        offset: 0,
        limit: PAGE_SIZE,
        stage: stageFilter ?? undefined,
        stale: smartFilter === "stale" || undefined,
        decisionReady: smartFilter === "decisionReady" || undefined,
        q: debouncedSearch || undefined,
        sortBy,
      });
      setItems(result.items);
      setTotal(result.total);
      setBulkIds(new Set());
      setFocusedId(result.items[0]?.id ?? null);
    });
  }, [roleId, stageFilter, smartFilter, debouncedSearch, sortBy]);

  const onLoadMore = useCallback(async () => {
    if (items.length >= total || isLoadingMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchApplicationsPage(roleId, {
        offset: items.length,
        limit: PAGE_SIZE,
        stage: stageFilter ?? undefined,
        stale: smartFilter === "stale" || undefined,
        decisionReady: smartFilter === "decisionReady" || undefined,
        q: debouncedSearch || undefined,
        sortBy,
      });
      setItems((prev) => [...prev, ...next.items]);
      setTotal(next.total);
    } finally {
      setLoadingMore(false);
    }
  }, [roleId, items.length, total, isLoadingMore, stageFilter, smartFilter, debouncedSearch, sortBy]);

  // SSE-driven refresh: refetch current page when applications/interviews/scorecards
  // change server-side. Preserves selection (drops IDs that vanished), focused row
  // (advances to next if removed), and filter state. Debounced to coalesce bursts.
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshList = useCallback(() => {
    if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    refreshDebounceRef.current = setTimeout(async () => {
      const result = await fetchApplicationsPage(roleId, {
        offset: 0,
        limit: Math.max(PAGE_SIZE, items.length), // keep loaded count stable across refresh
        stage: stageFilter ?? undefined,
        stale: smartFilter === "stale" || undefined,
        decisionReady: smartFilter === "decisionReady" || undefined,
        q: debouncedSearch || undefined,
        sortBy,
      });
      setItems(result.items);
      setTotal(result.total);
      // Drop selection IDs that no longer exist.
      const newIds = new Set(result.items.map((a) => a.id));
      setBulkIds((prev) => {
        const next = new Set(Array.from(prev).filter((id) => newIds.has(id)));
        return next.size === prev.size ? prev : next;
      });
      // Advance focus if the focused row vanished.
      setFocusedId((prev) => (prev && newIds.has(prev) ? prev : result.items[0]?.id ?? null));
    }, 300);
  }, [roleId, items.length, stageFilter, smartFilter, debouncedSearch, sortBy]);
  useEffect(() => () => { if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current); }, []);
  useEntityEvent(["application", "interview", "scorecard", "match"], undefined, refreshList);

  const toggleBulk = (id: string) => {
    setBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const focused = items.find((r) => r.id === focusedId) ?? null;

  // Restore helper — used by both reject and hold undo paths.
  const restorePrior = useCallback(
    async (prior: { id: string; priorStage: string }[]) => {
      const byStage = new Map<string, string[]>();
      for (const p of prior) {
        const list = byStage.get(p.priorStage) ?? [];
        list.push(p.id);
        byStage.set(p.priorStage, list);
      }
      for (const [stage, idsForStage] of byStage) {
        if (isTerminalStage(stage)) {
          await editApplicationsBatch(idsForStage, { stage: stage as "rejected" | "withdrawn" | "hired" });
        } else {
          await Promise.all(idsForStage.map((id) => editApplication(id, { stage })));
        }
      }
      // Refetch to bring rows back into view.
      const result = await fetchApplicationsPage(roleId, {
        offset: 0,
        limit: PAGE_SIZE,
        stage: stageFilter ?? undefined,
        stale: smartFilter === "stale" || undefined,
        decisionReady: smartFilter === "decisionReady" || undefined,
        q: debouncedSearch || undefined,
        sortBy,
      });
      setItems(result.items);
      setTotal(result.total);
    },
    [roleId, stageFilter, smartFilter, debouncedSearch, sortBy],
  );

  // Bulk reject confirmed from dialog.
  const handleRejectConfirm = (ids: string[], reason: string, addAsNote: boolean) => {
    startTransition(async () => {
      const result = await editApplicationsBatch(ids, { stage: "rejected" }, { reason });
      if (addAsNote && reason.trim() && result.succeeded.length > 0) {
        await addEntityNoteBulk(
          "application",
          result.succeeded.map((s) => s.id),
          reason.trim(),
        );
      }
      const movedIds = new Set(result.succeeded.map((s) => s.id));
      // Optimistic local update — drop only the actually-moved rows.
      setItems((prev) => prev.filter((a) => !movedIds.has(a.id)));
      setTotal((t) => Math.max(0, t - result.succeeded.length));
      setBulkIds(new Set());
      setShowReject(null);

      const reasonSuffix = reason.trim() ? ` · "${reason.trim()}"` : "";
      setUndoState({
        key: Date.now(),
        message: `Rejected ${result.succeeded.length} ${result.succeeded.length === 1 ? "candidate" : "candidates"}${reasonSuffix}`,
        skipped: result.skipped,
        onUndo: () => restorePrior(result.succeeded),
      });
    });
  };

  // Bulk hold (withdraw) — terminal but reversible.
  const handleHold = () => {
    const ids = Array.from(bulkIds);
    if (ids.length === 0) return;
    startTransition(async () => {
      const result = await editApplicationsBatch(ids, { stage: "withdrawn" });
      const movedIds = new Set(result.succeeded.map((s) => s.id));
      setItems((prev) => prev.filter((a) => !movedIds.has(a.id)));
      setTotal((t) => Math.max(0, t - result.succeeded.length));
      setBulkIds(new Set());

      setUndoState({
        key: Date.now(),
        message: `Held ${result.succeeded.length} ${result.succeeded.length === 1 ? "candidate" : "candidates"}`,
        skipped: result.skipped,
        onUndo: () => restorePrior(result.succeeded),
      });
    });
  };

  const searchRef = useRef<HTMLInputElement | null>(null);

  return (
    <div id="tour-role-pipeline" className={cn("space-y-4", isPending && "opacity-80 transition-opacity")}>
      <EntityListDetail<SerializedApplication>
        rows={items}
        totalLoaded={items.length}
        totalAvailable={total}
        isLoadingMore={isLoadingMore}
        onLoadMore={onLoadMore}
        selectedIds={bulkIds}
        onToggleSelect={toggleBulk}
        focusedId={focusedId}
        onFocus={setFocusedId}
        onFocusSearch={() => searchRef.current?.focus()}
        onFocusNotes={() => {
          const el = document.querySelector<HTMLTextAreaElement>("[data-notes-editor]");
          el?.focus();
        }}
        keyboardShortcuts={[
          {
            key: "e",
            description: "Run primary stage action on focused candidate",
            handler: ({ focusedItem }) => {
              if (!focusedItem) return;
              const next = nextStage(focusedItem, pipeline);
              const action = primaryActionFor(next, focusedItem, roleId, router, startTransition);
              action?.onClick();
            },
          },
          {
            key: "r",
            description: "Reject focused candidate",
            handler: ({ focusedItem }) => {
              if (!focusedItem) return;
              if (isTerminalStage(focusedItem.stage)) return;
              setShowReject({ ids: [focusedItem.id] });
            },
          },
          {
            key: "h",
            description: "Hold (withdraw) focused candidate",
            handler: ({ focusedItem }) => {
              if (!focusedItem) return;
              if (isTerminalStage(focusedItem.stage)) return;
              startTransition(async () => {
                await editApplication(focusedItem.id, { stage: "withdrawn" });
                setItems((prev) => prev.filter((a) => a.id !== focusedItem.id));
                setTotal((t) => Math.max(0, t - 1));
              });
            },
          },
        ]}
        keyboardHints={
          <span className="flex items-center gap-3">
            <span><Kbd>j</Kbd> <Kbd>k</Kbd> move</span>
            <span><Kbd>x</Kbd> select</span>
            <span><Kbd>e</Kbd> action</span>
            <span><Kbd>r</Kbd> reject</span>
            <span><Kbd>n</Kbd> note</span>
          </span>
        }
        chips={
          smartCounts && (smartCounts.stale > 0 || smartCounts.decisionReady > 0) ? (
            <div className="flex gap-2 items-center">
              {smartCounts.decisionReady > 0 && (
                <ChipButton
                  active={smartFilter === "decisionReady"}
                  onClick={() => { setSmartFilter(smartFilter === "decisionReady" ? null : "decisionReady"); setStageFilter(null); }}
                >
                  ⚡ Decision ready <span className="tabular-nums opacity-70">{smartCounts.decisionReady}</span>
                </ChipButton>
              )}
              {smartCounts.stale > 0 && (
                <ChipButton
                  active={smartFilter === "stale"}
                  onClick={() => { setSmartFilter(smartFilter === "stale" ? null : "stale"); setStageFilter(null); }}
                >
                  ⏳ Stale <span className="tabular-nums opacity-70">{smartCounts.stale}</span>
                </ChipButton>
              )}
            </div>
          ) : null
        }
        toolbar={
          <div className="flex items-center gap-2">
            <Input
              ref={searchRef}
              type="search"
              placeholder="Search candidates… (/)"
              className="h-8 w-56 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger size="sm" className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">Sort: Newest ↓</SelectItem>
                <SelectItem value="updatedAt">Sort: Recent activity ↓</SelectItem>
                <SelectItem value="daysInStage">Sort: Days in stage ↓</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        bulkBar={
          bulkIds.size > 0 ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium tabular-nums">{bulkIds.size} selected</span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="soft"
                    size="sm"
                    disabled={isPending || bulkIds.size < 2 || bulkIds.size > 4}
                    onClick={() => setShowCompare(true)}
                    className="text-[11px]"
                    title={
                      bulkIds.size < 2
                        ? "Compare requires 2 candidates"
                        : bulkIds.size > 4
                          ? "Compare supports up to 4"
                          : undefined
                    }
                  >
                    <GitCompare className="h-3 w-3" /> Compare
                  </Button>
                  <Button variant="soft" size="sm" disabled={isPending} onClick={handleHold} className="text-[11px]">
                    Hold
                  </Button>
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() => setShowReject({ ids: Array.from(bulkIds) })}
                    className="text-[11px] bg-red-600 text-white hover:bg-red-700"
                  >
                    Reject {bulkIds.size}…
                  </Button>
                  <Button variant="ghost" size="icon-xs" onClick={() => setBulkIds(new Set())}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {bulkIds.size === items.length && items.length < total && (
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pl-1">
                  <span>{items.length} of {total} loaded selected.</span>
                  <button
                    onClick={async () => {
                      const result = await fetchAllMatchingApplicationIds(roleId, {
                        stage: stageFilter ?? undefined,
                        stale: smartFilter === "stale" || undefined,
                        decisionReady: smartFilter === "decisionReady" || undefined,
                        q: debouncedSearch || undefined,
                      });
                      if (result.exceeded) {
                        // Fallback: too many to bulk-modify; instruct the user.
                        alert(`Too many to bulk-select (>500). Refine the filter and try again.`);
                        return;
                      }
                      setBulkIds(new Set(result.ids));
                    }}
                    className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
                    disabled={isPending}
                  >
                    Select all {total} matching →
                  </button>
                </div>
              )}
            </div>
          ) : null
        }
        renderRow={(app, state) => (
          <MatchRow
            candidateId={app.candidateId}
            candidateName={app.candidateName}
            fitScore={app.fitScore}
            recommendation={app.recommendation}
            evidenceBasis={app.evidenceBasis}
            signal={app.signal}
            daysInStage={app.daysInStage}
            isStale={(app.daysInStage ?? 0) >= STALE_THRESHOLD_DAYS}
            interviewProgress={app.interviewProgress}
            lastNotePreview={app.lastNotePreview}
            selected={state.selected}
            focused={state.focused}
            onToggleSelect={() => toggleBulk(app.id)}
          />
        )}
        renderDetail={(app) => (
          <PipelineDetailPane
            app={app}
            pipeline={pipeline}
            roleId={roleId}
            router={router}
            onAfterAction={() => {
              // Refetch the page to reflect server changes (stage advances, etc.)
              startTransition(async () => {
                const result = await fetchApplicationsPage(roleId, {
                  offset: 0,
                  limit: items.length || PAGE_SIZE,
                  stage: stageFilter ?? undefined,
                  q: debouncedSearch || undefined,
                  sortBy,
                });
                setItems(result.items);
                setTotal(result.total);
              });
            }}
            onBeforeReject={() => setShowReject({ ids: [app.id] })}
          />
        )}
        renderEmptyDetail={() => (
          <div className="flex h-full min-h-[300px] items-center justify-center text-center px-6">
            <p className="text-xs text-muted-foreground">Select a candidate to view details and notes.</p>
          </div>
        )}
        emptyState={
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-12 text-center">
            <Users className="h-6 w-6 text-muted-foreground/30" />
            <p className="text-xs font-semibold text-foreground">
              {stageFilter || search || smartFilter ? "No candidates match these filters" : "No candidates in pipeline yet"}
            </p>
            {(stageFilter || search || smartFilter) && (
              <Button variant="soft" size="sm" onClick={() => { setStageFilter(null); setSmartFilter(null); setSearch(""); }} className="text-[11px]">
                Clear filters
              </Button>
            )}
          </div>
        }
      />

      {showCompare && bulkIds.size >= 2 && bulkIds.size <= 4 && (
        <CompareDrawer
          roleId={roleId}
          roleTitle={roleTitle}
          candidates={items.filter((a) => bulkIds.has(a.id))}
          onClose={() => setShowCompare(false)}
        />
      )}

      {showReject && (
        <RejectDialog
          ids={showReject.ids}
          onConfirm={handleRejectConfirm}
          onCancel={() => setShowReject(null)}
        />
      )}

      {undoState && (
        <UndoToast
          key={undoState.key}
          message={undoState.message}
          skipped={undoState.skipped}
          onUndo={undoState.onUndo}
          onExpire={() => setUndoState(null)}
          onUndone={() => setUndoState(null)}
        />
      )}
    </div>
  );
}

/* -- Reject confirmation dialog -------------------------------------- */

function RejectDialog({
  ids,
  onConfirm,
  onCancel,
}: {
  ids: string[];
  onConfirm: (ids: string[], reason: string, addAsNote: boolean) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [addAsNote, setAddAsNote] = useState(true);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reject {ids.length} {ids.length === 1 ? "candidate" : "candidates"}?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Stage moves to Rejected. You can undo within 8 seconds.
          </p>
          <div>
            <label className="text-xs font-medium block mb-1">Reason (optional)</label>
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Not a fit for current scope"
              rows={3}
              className="w-full text-sm px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 resize-none"
            />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={addAsNote}
              onChange={(e) => setAddAsNote(e.target.checked)}
              className="rounded border-border"
            />
            Add reason as a note on each application
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="soft" size="sm" onClick={onCancel} className="text-[11px]">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => onConfirm(ids, reason, addAsNote)}
              className="text-[11px] bg-red-600 text-white hover:bg-red-700"
            >
              Reject {ids.length}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -- Pipeline right-pane detail ------------------------------------- */

function PipelineDetailPane({
  app,
  pipeline,
  roleId,
  router,
  onAfterAction,
  onBeforeReject,
}: {
  app: SerializedApplication;
  pipeline: PipelineStage[];
  roleId: string;
  router: ReturnType<typeof useRouter>;
  onAfterAction: () => void;
  onBeforeReject: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const next = nextStage(app, pipeline);
  const primary = primaryActionFor(next, app, roleId, router, startTransition);

  const actions = (
    <>
      {!isTerminalStage(app.stage) && (
        <>
          <Button
            variant="soft"
            size="sm"
            disabled={isPending}
            onClick={() => startTransition(async () => {
              await editApplication(app.id, { stage: "withdrawn" });
              onAfterAction();
            })}
            className="text-[11px]"
          >
            Hold
          </Button>
          <Button
            size="sm"
            disabled={isPending}
            onClick={onBeforeReject}
            className="text-[11px] bg-red-600 text-white hover:bg-red-700"
          >
            Reject…
          </Button>
        </>
      )}
      {primary && (
        <Button size="sm" disabled={isPending} onClick={() => { primary.onClick(); setTimeout(onAfterAction, 100); }} className="text-[11px]">
          {primary.icon}
          {primary.label}
        </Button>
      )}
    </>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <MatchCard
          flat
          headerActions={actions}
          title={app.candidateName}
          href={`/recruit/candidates/${app.candidateId}`}
          subtitle={`${app.candidateTitle || "No title"}${app.candidateCompany ? ` at ${app.candidateCompany}` : ""}`}
          fitScore={app.fitScore}
          recommendation={app.recommendation}
          alignment={app.alignment}
          signal={app.signal}
          gaps={app.gaps}
          summary={app.summary}
          evidenceBasis={app.evidenceBasis}
          stage={app.stage}
          daysInStage={app.daysInStage}
          createdAt={app.createdAt}
          interviewProgress={app.interviewProgress}
          isPending={isPending}
        />
        <div className="px-5 pb-5">
          <NotesPanel entityType="application" entityId={app.id} scopeBadge="On this role" />
        </div>
      </div>
    </div>
  );
}

/* -- Recommended on shell -------------------------------------------- */

const RECOMMENDATION_LEVELS = [
  { id: "strong_yes", letter: "S", label: "Strong yes", dot: "bg-emerald-600" },
  { id: "yes", letter: "Y", label: "Yes", dot: "bg-blue-500" },
  { id: "maybe", letter: "M", label: "Maybe", dot: "bg-amber-500" },
] as const;

/**
 * Adapt a SerializedRecommended into the SerializedApplication shape that
 * CompareDrawer expects. Synthesizes safe defaults for fields that don't
 * exist on a pre-pipeline match (stage, interviews, offer).
 */
function recommendedToApplicationShape(rec: SerializedRecommended): SerializedApplication {
  return {
    id: rec.id,
    candidateId: rec.candidateId,
    candidateName: rec.candidateName,
    candidateTitle: rec.candidateTitle,
    candidateCompany: rec.candidateCompany,
    stage: "recommended",
    fitScore: rec.fitScore,
    recommendation: rec.recommendation,
    alignment: rec.alignment,
    signal: rec.signal,
    gaps: rec.gaps,
    summary: rec.summary,
    evidenceBasis: rec.evidenceBasis,
    daysInStage: null,
    source: rec.candidateSource,
    createdAt: rec.matchedAt,
    interviewProgress: [],
    currentInterviewId: null,
    currentStageId: null,
    offerId: null,
  };
}

function RecommendedEntityList({
  initialItems,
  initialTotal,
  smartCounts,
  roleId,
  roleTitle,
  onTotalChange,
}: {
  initialItems: SerializedRecommended[];
  initialTotal: number;
  smartCounts?: { newThisWeek: number };
  roleId: string;
  roleTitle: string;
  /** Fired whenever the wrapper's total changes — parent uses this for the tab counter. */
  onTotalChange?: (total: number) => void;
}) {
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  useEffect(() => { onTotalChange?.(total); }, [total, onTotalChange]);
  const [recFilter, setRecFilter] = useState<string | null>(null);
  const [smartFilter, setSmartFilter] = useState<"newThisWeek" | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 250);
  const [sortBy, setSortBy] = useState<"fitScore" | "matchedAt">("fitScore");
  const [bulkIds, setBulkIds] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(initialItems[0]?.id ?? null);
  const [showCompare, setShowCompare] = useState(false);
  const [infoToast, setInfoToast] = useState<{
    key: number;
    message: string;
    skipped?: { id: string; reason: string }[];
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isLoadingMore, setLoadingMore] = useState(false);

  // Refetch on filter/sort change.
  useEffect(() => {
    startTransition(async () => {
      const result = await fetchRecommendationsPage(roleId, {
        offset: 0,
        limit: PAGE_SIZE,
        recommendation: recFilter ?? undefined,
        q: debouncedSearch || undefined,
        sortBy,
        recencyDays: smartFilter === "newThisWeek" ? 7 : undefined,
      });
      setItems(result.items);
      setTotal(result.total);
      setBulkIds(new Set());
      setFocusedId(result.items[0]?.id ?? null);
    });
  }, [roleId, recFilter, smartFilter, debouncedSearch, sortBy]);

  const onLoadMore = useCallback(async () => {
    if (items.length >= total || isLoadingMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchRecommendationsPage(roleId, {
        offset: items.length,
        limit: PAGE_SIZE,
        recommendation: recFilter ?? undefined,
        q: debouncedSearch || undefined,
        sortBy,
        recencyDays: smartFilter === "newThisWeek" ? 7 : undefined,
      });
      setItems((prev) => [...prev, ...next.items]);
      setTotal(next.total);
    } finally {
      setLoadingMore(false);
    }
  }, [roleId, items.length, total, isLoadingMore, recFilter, smartFilter, debouncedSearch, sortBy]);

  // SSE-driven refresh: refetch current page when matches change server-side
  // (e.g. another user converts/dismisses; new sourcing run completes).
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshList = useCallback(() => {
    if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    refreshDebounceRef.current = setTimeout(async () => {
      const result = await fetchRecommendationsPage(roleId, {
        offset: 0,
        limit: Math.max(PAGE_SIZE, items.length),
        recommendation: recFilter ?? undefined,
        q: debouncedSearch || undefined,
        sortBy,
        recencyDays: smartFilter === "newThisWeek" ? 7 : undefined,
      });
      setItems(result.items);
      setTotal(result.total);
      const newIds = new Set(result.items.map((r) => r.id));
      setBulkIds((prev) => {
        const next = new Set(Array.from(prev).filter((id) => newIds.has(id)));
        return next.size === prev.size ? prev : next;
      });
      setFocusedId((prev) => (prev && newIds.has(prev) ? prev : result.items[0]?.id ?? null));
    }, 300);
  }, [roleId, items.length, recFilter, smartFilter, debouncedSearch, sortBy]);
  useEffect(() => () => { if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current); }, []);
  useEntityEvent(["match", "candidate"], undefined, refreshList);

  const toggleBulk = (id: string) => {
    setBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddToPipeline = () => {
    const selected = items.filter((r) => bulkIds.has(r.id));
    if (selected.length === 0) return;
    startTransition(async () => {
      const result = await addMatchesToPipelineBatch(
        selected.map((r) => ({ matchId: r.id, roleId, candidateId: r.candidateId })),
      );
      // Drop only the actually-converted matches (server skips already-converted/dismissed).
      const movedMatchIds = new Set(result.succeeded.map((s) => s.matchId));
      setItems((prev) => prev.filter((r) => !movedMatchIds.has(r.id)));
      setTotal((t) => Math.max(0, t - result.succeeded.length));
      setBulkIds(new Set());
      // Surface the result via a non-destructive info toast (no Undo —
      // add-to-pipeline is non-destructive; users can manually reject if
      // they meant to undo).
      setInfoToast({
        key: Date.now(),
        message: `Added ${result.succeeded.length} to pipeline`,
        skipped: result.skipped.length > 0 ? result.skipped : undefined,
      });
    });
  };

  const handleDismiss = () => {
    if (bulkIds.size === 0) return;
    const ids = Array.from(bulkIds);
    startTransition(async () => {
      await dismissMatchesBatch(ids);
      setItems((prev) => prev.filter((r) => !bulkIds.has(r.id)));
      setTotal((t) => Math.max(0, t - ids.length));
      setBulkIds(new Set());
      setInfoToast({
        key: Date.now(),
        message: `Dismissed ${ids.length} ${ids.length === 1 ? "recommendation" : "recommendations"}`,
      });
    });
  };

  const focused = items.find((r) => r.id === focusedId) ?? null;
  const searchRef = useRef<HTMLInputElement | null>(null);

  return (
    <div id="tour-role-recommended" className={cn("space-y-3", isPending && "opacity-80 transition-opacity")}>
      <EntityListDetail<SerializedRecommended>
        rows={items}
        totalLoaded={items.length}
        totalAvailable={total}
        isLoadingMore={isLoadingMore}
        onLoadMore={onLoadMore}
        selectedIds={bulkIds}
        onToggleSelect={toggleBulk}
        focusedId={focusedId}
        onFocus={setFocusedId}
        chips={
          <div className="flex gap-2 items-center">
            {RECOMMENDATION_LEVELS.map((level) => (
              <ChipButton
                key={level.id}
                active={recFilter === level.id}
                onClick={() => { setRecFilter(recFilter === level.id ? null : level.id); setSmartFilter(null); }}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", level.dot)} />
                {level.label}
              </ChipButton>
            ))}
            {smartCounts && smartCounts.newThisWeek > 0 && (
              <>
                <span className="h-5 w-px bg-border mx-1" />
                <ChipButton
                  active={smartFilter === "newThisWeek"}
                  onClick={() => { setSmartFilter(smartFilter === "newThisWeek" ? null : "newThisWeek"); setRecFilter(null); }}
                >
                  ✨ New this week <span className="tabular-nums opacity-70">{smartCounts.newThisWeek}</span>
                </ChipButton>
              </>
            )}
          </div>
        }
        toolbar={
          <div className="flex items-center gap-2">
            <Input
              ref={searchRef}
              type="search"
              placeholder="Search candidates… (/)"
              className="h-8 w-56 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as "fitScore" | "matchedAt")}>
              <SelectTrigger size="sm" className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fitScore">Sort: Fit ↓</SelectItem>
                <SelectItem value="matchedAt">Sort: Matched ↓</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        onFocusSearch={() => searchRef.current?.focus()}
        keyboardShortcuts={[
          {
            key: "a",
            description: "Add focused recommendation to pipeline",
            handler: ({ focusedItem }) => {
              if (!focusedItem) return;
              startTransition(async () => {
                await addMatchToPipeline(focusedItem.id, roleId, focusedItem.candidateId);
                setItems((prev) => prev.filter((r) => r.id !== focusedItem.id));
                setTotal((t) => Math.max(0, t - 1));
              });
            },
          },
          {
            key: "d",
            description: "Dismiss focused recommendation",
            handler: ({ focusedItem }) => {
              if (!focusedItem) return;
              startTransition(async () => {
                await dismissMatch(focusedItem.id);
                setItems((prev) => prev.filter((r) => r.id !== focusedItem.id));
                setTotal((t) => Math.max(0, t - 1));
              });
            },
          },
        ]}
        keyboardHints={
          <span className="flex items-center gap-3">
            <span><Kbd>j</Kbd> <Kbd>k</Kbd> move</span>
            <span><Kbd>x</Kbd> select</span>
            <span><Kbd>a</Kbd> add</span>
            <span><Kbd>d</Kbd> dismiss</span>
          </span>
        }
        bulkBar={
          bulkIds.size > 0 ? (
            <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
              <span className="text-sm font-medium tabular-nums">{bulkIds.size} selected</span>
              <div className="flex items-center gap-1.5">
                <Button size="sm" disabled={isPending} onClick={handleAddToPipeline} className="text-[11px]">
                  <ArrowRight className="h-3 w-3" /> Add {bulkIds.size} to pipeline
                </Button>
                <Button
                  variant="soft"
                  size="sm"
                  disabled={isPending || bulkIds.size < 2 || bulkIds.size > 4}
                  onClick={() => setShowCompare(true)}
                  className="text-[11px]"
                  title={
                    bulkIds.size < 2
                      ? "Compare requires 2 candidates"
                      : bulkIds.size > 4
                        ? "Compare supports up to 4"
                        : undefined
                  }
                >
                  <GitCompare className="h-3 w-3" /> Compare
                </Button>
                <Button variant="soft" size="sm" disabled={isPending} onClick={handleDismiss} className="text-[11px]">
                  Dismiss
                </Button>
                <Button variant="ghost" size="icon-xs" onClick={() => setBulkIds(new Set())}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : null
        }
        renderRow={(rec, state) => (
          <MatchRow
            candidateId={rec.candidateId}
            candidateName={rec.candidateName}
            fitScore={rec.fitScore}
            recommendation={rec.recommendation}
            evidenceBasis={rec.evidenceBasis}
            signal={rec.signal}
            matchedAt={rec.matchedAt}
            poolBadge={rec.candidateSource ?? undefined}
            selected={state.selected}
            focused={state.focused}
            onToggleSelect={() => toggleBulk(rec.id)}
          />
        )}
        renderDetail={(rec) => (
          <RecommendedDetailPane rec={rec} roleId={roleId} onAfterAction={() => {
            setItems((prev) => prev.filter((r) => r.id !== rec.id));
            setTotal((t) => Math.max(0, t - 1));
            setBulkIds((prev) => { const next = new Set(prev); next.delete(rec.id); return next; });
          }} />
        )}
        renderEmptyDetail={() => (
          <div className="flex h-full min-h-[300px] items-center justify-center text-center px-6">
            <p className="text-xs text-muted-foreground">Select a recommendation to view details.</p>
          </div>
        )}
        emptyState={
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-12 text-center">
            <Sparkles className="h-6 w-6 text-muted-foreground/30" />
            <p className="text-xs font-semibold text-foreground">
              {recFilter || search || smartFilter ? "No recommendations match these filters" : "No recommendations yet"}
            </p>
            {(recFilter || search || smartFilter) && (
              <Button variant="soft" size="sm" onClick={() => { setRecFilter(null); setSmartFilter(null); setSearch(""); }} className="text-[11px]">
                Clear filters
              </Button>
            )}
          </div>
        }
      />

      {/* Compare drawer — adapter shapes Recommended → Application for the existing drawer */}
      {showCompare && bulkIds.size >= 2 && bulkIds.size <= 4 && (
        <CompareDrawer
          roleId={roleId}
          roleTitle={roleTitle}
          candidates={items
            .filter((r) => bulkIds.has(r.id))
            .map(recommendedToApplicationShape)}
          onClose={() => setShowCompare(false)}
        />
      )}

      {infoToast && (
        <UndoToast
          key={infoToast.key}
          message={infoToast.message}
          skipped={infoToast.skipped}
          onExpire={() => setInfoToast(null)}
        />
      )}
    </div>
  );
}

function ChipButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors whitespace-nowrap",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}

function RecommendedDetailPane({
  rec,
  roleId,
  onAfterAction,
}: {
  rec: SerializedRecommended;
  roleId: string;
  onAfterAction: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const handleAdd = () => {
    startTransition(async () => {
      await addMatchToPipeline(rec.id, roleId, rec.candidateId);
      onAfterAction();
    });
  };
  const handleDismiss = () => {
    startTransition(async () => {
      await dismissMatch(rec.id);
      onAfterAction();
    });
  };

  const actions = (
    <>
      <Button variant="soft" size="sm" disabled={isPending} onClick={handleDismiss} className="text-[11px]">
        Dismiss
      </Button>
      <Button size="sm" disabled={isPending} onClick={handleAdd} className="text-[11px]">
        <ArrowRight className="h-3 w-3" /> Add to pipeline
      </Button>
    </>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <MatchCard
          flat
          headerActions={actions}
          title={rec.candidateName}
          href={`/recruit/candidates/${rec.candidateId}`}
          subtitle={`${rec.candidateTitle || "No title"}${rec.candidateCompany ? ` at ${rec.candidateCompany}` : ""}`}
          meta={rec.candidateSource ? `Source: ${rec.candidateSource}` : undefined}
          fitScore={rec.fitScore}
          recommendation={rec.recommendation}
          alignment={rec.alignment}
          signal={rec.signal}
          gaps={rec.gaps}
          summary={rec.summary}
          evidenceBasis={rec.evidenceBasis}
          matchedAt={rec.matchedAt}
          isPending={isPending}
        />
      </div>
    </div>
  );
}

/* -- Find more matches ------------------------------------------------ */

function FindMoreMatchesButton({ roleId }: { roleId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="default"
      size="sm"
      disabled={isPending}
      onClick={() => startTransition(async () => { await findMoreMatches(roleId); })}
      className="text-[11px] font-semibold"
    >
      {isPending ? (
        <>
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Finding matches…
        </>
      ) : (
        <>
          <Sparkles className="h-3 w-3" />
          Find more candidates
        </>
      )}
    </Button>
  );
}

/* -- Component ------------------------------------------------------- */

export default function RoleDetailClient({
  role,
  applications,
  applicationsTotal: initialAppTotal,
  interviews,
  recommended,
  recommendedTotal: initialRecTotal,
  panelHealth,
  triageItems,
  activityLog,
  pipelineSmartCounts,
  recommendedSmartCounts,
}: RoleDetailClientProps) {
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>("Pipeline");
  const [showShare, setShowShare] = useState(false);
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const days = daysOpen(role.createdAt);
  const router = useRouter();

  // Tab counters: seeded from server props, updated via wrapper callbacks
  // when the wrappers refetch. Avoids depending on router.refresh() to keep
  // counters in sync, and lets us drop `match` from the parent subscription
  // (only RecommendedEntityList cares about match events now).
  const [appTotal, setAppTotal] = useState(initialAppTotal);
  const [recTotal, setRecTotal] = useState(initialRecTotal);

  // Parent SSE: only events that affect parent-owned data
  // (panel health, smart-filter counts, triage, role header, interviews list).
  // Event ownership matrix:
  //   - role         → role header   (parent only)
  //   - triageItem   → triage list   (parent only)
  //   - interview    → panel health + Pipeline rows  (parent + Pipeline wrapper)
  //   - scorecard    → panel health + Pipeline rows  (parent + Pipeline wrapper)
  //   - application  → smart counts + panel health (offer count) + Pipeline rows
  //                                  (parent + Pipeline wrapper)
  //   - match        → Recommended rows only         (Recommended wrapper only)
  //   - candidate    → Recommended rows only         (Recommended wrapper only)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entityEventCallback = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      router.refresh();
    }, 300);
  }, [router]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEntityEvent(["role", "triageItem", "interview", "scorecard", "application"], undefined, entityEventCallback);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <div className="space-y-6">
          <Link href="/recruit/roles" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3 w-3" />
            Open Roles
          </Link>

          {/* Header */}
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{role.title}</h1>
                  <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-semibold", healthColor(role.health))}>{healthLabel(role.health)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {role.team && <span>{role.team}</span>}
                  {role.location && (<><span className="text-border">|</span><span>{role.location}</span></>)}
                  {role.compensation && (<><span className="text-border">|</span><span>{formatComp(role.compensation)}</span></>)}
                  {role.hiringManagerName && (<><span className="text-border">|</span><span>HM: {role.hiringManagerName}</span></>)}
                  {role.recruiterName && (<><span className="text-border">|</span><span>Recruiter: {role.recruiterName}</span></>)}
                  <span className="text-border">|</span>
                  <span>{days} days open</span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {/* Search portals — use top keywords for richer queries */}
                {role.title && (() => {
                  const searchTerms = [role.title, ...role.keywords].join(" ");
                  return (
                    <div className="flex items-center rounded-md border divide-x">
                      <a
                        href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(searchTerms + (role.location ? ` ${role.location}` : ""))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center h-8 w-8 hover:bg-muted transition-colors first:rounded-l-md"
                        title="Search LinkedIn"
                      >
                        <svg className="h-5 w-5" fill="currentColor" viewBox="-5.5 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M0 8.219v15.563c0 1.469 1.156 2.625 2.625 2.625h15.563c0.719 0 1.406-0.344 1.844-0.781 0.469-0.469 0.781-1.063 0.781-1.844v-15.563c0-1.469-1.156-2.625-2.625-2.625h-15.563c-0.781 0-1.375 0.313-1.844 0.781-0.438 0.438-0.781 1.125-0.781 1.844zM2.813 10.281c0-1 0.813-1.875 1.813-1.875 1.031 0 1.875 0.875 1.875 1.875 0 1.031-0.844 1.844-1.875 1.844-1 0-1.813-0.813-1.813-1.844zM7.844 23.125v-9.531c0-0.219 0.219-0.406 0.375-0.406h2.656c0.375 0 0.375 0.438 0.375 0.719 0.75-0.75 1.719-0.938 2.719-0.938 2.438 0 4 1.156 4 3.719v6.438c0 0.219-0.188 0.406-0.375 0.406h-2.75c-0.219 0-0.375-0.219-0.375-0.406v-5.813c0-0.969-0.281-1.5-1.375-1.5-1.375 0-1.719 0.906-1.719 2.125v5.188c0 0.219-0.219 0.406-0.438 0.406h-2.719c-0.156 0-0.375-0.219-0.375-0.406zM2.875 23.125v-9.531c0-0.219 0.219-0.406 0.375-0.406h2.719c0.25 0 0.406 0.156 0.406 0.406v9.531c0 0.219-0.188 0.406-0.406 0.406h-2.719c-0.188 0-0.375-0.219-0.375-0.406z" /></svg>
                      </a>
                      <a
                        href={`https://www.indeed.com/resumes?q=${encodeURIComponent(searchTerms)}${role.location ? `&l=${encodeURIComponent(role.location)}` : ""}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center h-8 w-8 hover:bg-muted transition-colors"
                        title="Search Indeed"
                      >
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M14.822 10.308a3.018 3.018 0 111.32-4.038 3.006 3.006 0 01-1.32 4.044zM11.6.572c2.47-.901 5.294-.852 7.408.982a3.587 3.587 0 011.023 1.37c.213.69-.749-.07-.88-.168a9.407 9.407 0 00-2.15-1.095C12.837.386 8.897 2.707 6.463 6.316a19.505 19.505 0 00-2.248 5.126 2.918 2.918 0 01-.213.642c-.107.204-.049-.547-.049-.572a15.821 15.821 0 01.43-2.239C5.511 5.34 8.01 2.065 11.6.565zm.037 20.993v-8.763c.249.025.486.037.736.037a6.167 6.167 0 003.219-.895v9.62c0 .822-.15 1.43-.52 1.826A1.874 1.874 0 0113.62 24a1.825 1.825 0 01-1.427-.609c-.368-.404-.56-1.013-.56-1.825z" /></svg>
                      </a>
                      <a
                        href={`https://resdex.naukri.com/search?q=${encodeURIComponent(searchTerms)}${role.location ? `&loc=${encodeURIComponent(role.location)}` : ""}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center h-8 w-8 hover:bg-muted transition-colors last:rounded-r-md"
                        title="Search Naukri"
                      >
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path d="m37.3283,4.5c-16.2828,9.0606-25.6717,25.6061,3.2828,39-16.5455-.9192-27.6501-11.0456-25.8687-21.798,1.7404-10.5051,9.5859-14.8384,22.5859-17.202Z" /><circle cx="11.6566" cy="8.7677" r="4.2677" /></svg>
                      </a>
                    </div>
                  );
                })()}
                {/* Actions */}
                <div className="flex items-center rounded-md border divide-x">
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="inline-flex items-center justify-center h-8 w-8 hover:bg-muted transition-colors first:rounded-l-md"
                    title="Share"
                    onClick={() => setShowShare(true)}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="inline-flex items-center justify-center h-8 w-8 hover:bg-muted transition-colors last:rounded-r-md"
                    title="View Report"
                    asChild
                  >
                    <Link href={`/recruit/reports/role/${role.id}`} target="_blank">
                      <FileText className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
                <AskAIButton entity="role" id={role.id} view="detail" data={{ role, applications, interviews, recommended, panelHealth, triageItems }} />
                <Link href={`/recruit/roles/${role.id}/edit`} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <Pencil className="h-3 w-3" />
                  Edit
                </Link>
                <Link href="/recruit/offers" className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
                  <HandCoins className="h-3 w-3" />
                  View offers
                </Link>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-1 overflow-x-auto text-xs">
              {role.pipeline.map((stage, idx) => {
                const isInterview = stage.type === "interview";
                const hasCount = stage.count > 0;
                const isPipelineTab = activeTab === "Pipeline";
                const isActive = isPipelineTab && stageFilter === stage.id;
                const handleClick = isPipelineTab
                  ? () => setStageFilter(stageFilter === stage.id ? null : stage.id)
                  : undefined;
                return (
                  <div key={stage.id} className="flex items-center gap-1 shrink-0">
                    {idx > 0 && (
                      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" aria-hidden />
                    )}
                    <button
                      type="button"
                      onClick={handleClick}
                      disabled={!handleClick}
                      title={isPipelineTab ? `Filter: ${stage.name} (${stage.count})` : `${stage.name}: ${stage.count}`}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : hasCount
                            ? isInterview
                              ? "bg-primary/10 text-foreground"
                              : "bg-secondary text-foreground"
                            : "text-muted-foreground",
                        handleClick && !isActive && "hover:bg-secondary/80 cursor-pointer",
                        !handleClick && "cursor-default",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
                          isActive
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : hasCount
                              ? isInterview
                                ? "bg-primary text-primary-foreground"
                                : "bg-foreground text-background"
                              : "bg-border text-muted-foreground",
                        )}
                      >
                        {stage.count}
                      </span>
                      <span className="truncate text-[11px] font-medium">{stage.name}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>


          {/* AI insights — triage + matching CTA merged */}
          {(triageItems.length > 0 || recTotal >= 0) && (
            <div className="rounded-xl border border-border bg-card">
              {triageItems.length > 0 && (
                <div className="divide-y divide-border">
                  {triageItems.map((item) => (
                    <TriageItem key={item.id} title={item.title} action={item.action} urgency={item.urgency} className="px-4 py-3" />
                  ))}
                </div>
              )}
              <div className={cn(
                "flex items-center justify-between gap-3 px-4 py-2.5",
                triageItems.length > 0 && "border-t border-border bg-secondary/30",
              )}>
                <p className="text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground tabular-nums">{recTotal}</span> matched from sourcing channels, talent pools, and applications
                </p>
                <FindMoreMatchesButton roleId={role.id} />
              </div>
            </div>
          )}

          {/* Tabs */}
          <div id="tour-role-tabs" className="flex items-center gap-1 border-b border-border">
            {TABS.map((tab) => {
              const count = tab === "Pipeline" ? appTotal
                : tab === "Recommended" ? recTotal
                : tab === "Interviews" ? interviews.length
                : tab === "Feed" ? activityLog.length
                : null;
              return (
                <Button variant="ghost" key={tab} onClick={() => setActiveTab(tab)} className={cn("flex items-center gap-1.5 rounded-none px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px", activeTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                  {tab}
                  {count !== null && (
                    <span className={cn("rounded-full px-1.5 py-0 text-[9px] tabular-nums font-semibold", activeTab === tab ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>{count}</span>
                  )}
                </Button>
              );
            })}
          </div>

          {/* Tab: Pipeline */}
          {activeTab === "Pipeline" && (
            <PipelineEntityList
              initialItems={applications}
              initialTotal={appTotal}
              pipeline={role.pipeline}
              smartCounts={pipelineSmartCounts}
              roleId={role.id}
              roleTitle={role.title}
              stageFilter={stageFilter}
              onStageFilterChange={setStageFilter}
              onTotalChange={setAppTotal}
            />
          )}

          {/* Tab: Recommended */}
          {activeTab === "Recommended" && (
            <RecommendedEntityList
              initialItems={recommended}
              initialTotal={recTotal}
              smartCounts={recommendedSmartCounts}
              roleId={role.id}
              roleTitle={role.title}
              onTotalChange={setRecTotal}
            />
          )}

          {/* Tab: Interviews */}
          {activeTab === "Interviews" && (
            <div id="tour-role-interviews" className="space-y-3">
              {panelHealth && (
                <div id="tour-panel-health" className="rounded-xl border border-border bg-card p-5 space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Panel health</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-border bg-background px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Evidence</p>
                      <p className="mt-1 text-xs font-medium text-foreground">{panelHealth.evidenceCoverage}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-background px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Scorer drift</p>
                      <p className="mt-1 text-xs font-medium text-foreground">{panelHealth.scorerDrift}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-background px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Decision</p>
                      <p className="mt-1 text-xs font-medium text-foreground">{panelHealth.decisionReadiness}</p>
                    </div>
                  </div>
                  {panelHealth.warning && (
                    <div className="flex items-start gap-2 rounded-lg bg-amber-50/50 px-3 py-2">
                      <Flag className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                      <p className="text-xs leading-relaxed text-foreground">{panelHealth.warning}</p>
                    </div>
                  )}
                </div>
              )}
              {interviews.length > 0 ? (
                interviews.map((iv) => {
                  const statusStyles: Record<string, string> = {
                    completed: "text-emerald-700 bg-emerald-50 border-emerald-200",
                    confirmed: "text-blue-700 bg-blue-50 border-blue-200",
                    proposed: "text-amber-700 bg-amber-50 border-amber-200",
                    cancelled: "text-red-600 bg-red-50 border-red-200",
                  };
                  const statusLabel: Record<string, string> = {
                    completed: "Completed",
                    confirmed: "Confirmed",
                    proposed: "Proposed",
                    cancelled: "Cancelled",
                  };
                  return (
                  <Link key={iv.id} href={`/recruit/interviews/${iv.id}`} className="block rounded-xl border border-border bg-card px-5 py-4 hover:border-primary/30 hover:bg-card/80 transition-colors">
                    <div className="flex items-center gap-4">
                      {/* Avatar / initials */}
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-muted-foreground">
                        {iv.candidateName ? iv.candidateName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : <User className="h-4 w-4" />}
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">{iv.candidateName || "TBD"}</p>
                          {iv.interviewType && (
                            <span className="shrink-0 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{iv.interviewType}</span>
                          )}
                          {iv.stageName && (
                            <span className="shrink-0 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary">{iv.stageName}</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground truncate">
                          {[
                            iv.candidateTitle,
                            iv.panelistNames.length > 0 ? `with ${iv.panelistNames.join(", ")}` : null,
                            iv.scheduledAt ? `${formatRelativeDate(iv.scheduledAt)}, ${formatTime(iv.scheduledAt)}` : "Not scheduled",
                            `${iv.durationMins || 45} min`,
                            iv.location,
                            iv.meetingLink && !iv.location ? "Video call" : null,
                          ].filter(Boolean).join(" · ")}
                        </p>
                      </div>

                      {/* Status + verdict */}
                      <div className="flex items-center gap-2 shrink-0">
                        {iv.scorecards.length > 0 ? (
                          iv.scorecards.map((sc) => (
                            <span key={sc.id} className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize",
                              sc.verdict === "strong_yes" || sc.verdict === "yes" ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                : sc.verdict === "maybe" ? "text-amber-700 bg-amber-50 border-amber-200"
                                : sc.verdict === "no" || sc.verdict === "strong_no" ? "text-red-600 bg-red-50 border-red-200"
                                : "text-muted-foreground bg-secondary border-border",
                            )}>
                              {(sc.verdict ?? "pending").replace(/_/g, " ")}
                            </span>
                          ))
                        ) : (
                          <span className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                            statusStyles[iv.status] ?? "text-muted-foreground bg-secondary border-border",
                          )}>
                            {statusLabel[iv.status] ?? iv.status}
                          </span>
                        )}
                      </div>
                    </div>

                    {iv.evidenceTarget && (
                      <p className="mt-2.5 ml-[52px] text-[11px] text-muted-foreground"><span className="font-semibold text-foreground">Evidence target:</span> {iv.evidenceTarget}</p>
                    )}

                    {iv.scorecards.length > 0 && iv.scorecards.some((sc) => sc.notes || (sc.ratings && sc.ratings.length > 0)) && (
                      <div className="mt-3 ml-[52px] space-y-2">
                        {iv.scorecards.map((sc) => (
                          <div key={sc.id} className="rounded-lg border border-border/60 bg-secondary/10 px-3 py-2.5 space-y-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              {sc.reviewerName || "Reviewer"} &middot; {sc.overallRating != null ? `${sc.overallRating}/5` : ""}
                            </p>
                            {sc.ratings.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {sc.ratings.map((r) => (
                                  <span key={r.competency} className={cn(
                                    "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                    r.rating >= 4 ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                      : r.rating >= 3 ? "text-amber-700 bg-amber-50 border-amber-200"
                                      : "text-red-600 bg-red-50 border-red-200",
                                  )}>
                                    {r.competency}: {r.rating}
                                  </span>
                                ))}
                              </div>
                            )}
                            {sc.notes && <p className="text-xs leading-relaxed text-muted-foreground">{sc.notes}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </Link>
                  );
                })
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-8 text-center">
                  <CalendarClock className="h-6 w-6 text-muted-foreground/30" />
                  <p className="text-xs font-semibold text-foreground">No interviews scheduled</p>
                </div>
              )}
            </div>
          )}

          {/* Tab: Feed */}
          {activeTab === "Feed" && (
            <EntityActivity entries={activityLog} entityType="role" entityId={role.id} />
          )}
        </div>
      </div>

      {/* Report link moved to standalone route: /recruit/reports/role/[id] */}

      {/* Share panel */}
      {showShare && (
        <SharePanel
          roleId={role.id}
          roleTitle={role.title}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
