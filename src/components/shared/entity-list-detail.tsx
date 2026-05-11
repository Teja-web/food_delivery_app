"use client";

/**
 * EntityListDetail — generic split list-detail shell for high-volume review surfaces.
 *
 * Used by:
 *   - Role detail Recommended tab (Phase 1)
 *   - Role detail Pipeline tab (Phase 2)
 *   - Future high-volume entity lists (candidates, pool members, interviews)
 *
 * Scope discipline (Phase 1/2 deferrals — Phase 3 has now landed keyboard nav):
 *   - No row virtualization. Recommended tabs typically render 10–50 rows;
 *     a future phase can introduce @tanstack/react-virtual when Pipeline
 *     volumes justify it.
 *   - No Sheet primitive for mobile. Below lg:, list and detail stack
 *     vertically. A future phase can layer a Sheet if mobile needs polish.
 *   - No URL state for focusedId. Parent owns the state. A future phase can
 *     wire URL sync if deep linking becomes necessary.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type EntityListDetailProps<T extends { id: string }> = {
  /** Rows currently loaded (server pagination already applied). */
  rows: T[];
  totalLoaded: number;
  totalAvailable: number;

  /** Infinite-scroll trigger. Called when last row enters viewport. */
  isLoadingMore: boolean;
  onLoadMore: () => void | Promise<void>;

  /** Selection state. Owner decides cap semantics (compare ≤4 vs uncapped bulk). */
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  /** Select all currently loaded rows. */
  onSelectAll?: () => void;
  /** Optional: extend selection to all rows matching server filter (Phase 3). */
  onSelectAllMatching?: () => void;

  /** Which row's detail is shown in the right pane. Null = empty state. */
  focusedId: string | null;
  onFocus: (id: string) => void;

  /** Slots — caller supplies tab-flavored content. */
  renderRow: (item: T, state: { selected: boolean; focused: boolean }) => ReactNode;
  renderDetail: (item: T) => ReactNode;
  renderEmptyDetail?: () => ReactNode;
  /** Replaces the entire list+detail grid when rows is empty. Toolbar/chips still render. */
  emptyState?: ReactNode;

  toolbar: ReactNode;
  chips: ReactNode;
  /** Null when selection is empty. */
  bulkBar: ReactNode | null;
  /** Optional right-side header content (e.g. paper/observed legend). */
  legend?: ReactNode;
  /** Optional footer hints (e.g. j/k navigation cheatsheet). */
  keyboardHints?: ReactNode;

  className?: string;
  /** Test/debug ID forwarded to the wrapper. Used to preserve tour markers. */
  id?: string;

  /** Tab-specific keyboard shortcuts (e.g. Recommended adds "a" / "d"; Pipeline adds "e" / "r" / "h"). */
  keyboardShortcuts?: ShortcutDef<T>[];
  /** Caller-owned focus targets so global shortcuts can route correctly. */
  onFocusSearch?: () => void;
  onFocusNotes?: () => void;
};

/** A keyboard shortcut definition surfaced to the cheatsheet and bound at the window level. */
export type ShortcutDef<T> = {
  key: string;
  /** Display in the cheatsheet, e.g. "a" or "Shift+x". */
  display?: string;
  description: string;
  handler: (ctx: { focusedItem: T | null; selectedIds: Set<string> }) => void;
};

const SCROLL_LOAD_THRESHOLD = 0.8;

export function EntityListDetail<T extends { id: string }>(props: EntityListDetailProps<T>) {
  const {
    rows,
    totalLoaded,
    totalAvailable,
    isLoadingMore,
    onLoadMore,
    selectedIds,
    onToggleSelect,
    onSelectAll,
    focusedId,
    onFocus,
    renderRow,
    renderDetail,
    renderEmptyDetail,
    emptyState,
    toolbar,
    chips,
    bulkBar,
    legend,
    keyboardHints,
    className,
    id,
    keyboardShortcuts,
    onFocusSearch,
    onFocusNotes,
  } = props;

  const focusedItem = focusedId ? rows.find((r) => r.id === focusedId) ?? null : null;
  const [showHelp, setShowHelp] = useState(false);
  const anchorIdRef = useRef<string | null>(null);

  // Keyboard navigation. Listener installed at window level; ignored when
  // the user is typing in an input/textarea/contenteditable.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      // Allow ESC and ? even when an input is focused (close help / open help).
      if (e.key === "Escape") {
        if (showHelp) {
          setShowHelp(false);
          e.preventDefault();
          return;
        }
        // Don't preventDefault — let inputs blur naturally
      }

      if (inEditable) return;

      const idx = focusedId ? rows.findIndex((r) => r.id === focusedId) : -1;

      // Built-in navigation
      if (e.key === "j" || e.key === "ArrowDown") {
        const nextIdx = idx < 0 ? 0 : Math.min(rows.length - 1, idx + 1);
        if (rows[nextIdx]) {
          onFocus(rows[nextIdx].id);
          if (!e.shiftKey) anchorIdRef.current = rows[nextIdx].id;
          e.preventDefault();
        }
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        const prevIdx = idx < 0 ? 0 : Math.max(0, idx - 1);
        if (rows[prevIdx]) {
          onFocus(rows[prevIdx].id);
          if (!e.shiftKey) anchorIdRef.current = rows[prevIdx].id;
          e.preventDefault();
        }
        return;
      }
      if (e.key === "x") {
        if (e.shiftKey && anchorIdRef.current && focusedId) {
          // Range select from anchor → focused (inclusive).
          const a = rows.findIndex((r) => r.id === anchorIdRef.current);
          const b = rows.findIndex((r) => r.id === focusedId);
          if (a >= 0 && b >= 0) {
            const [lo, hi] = a < b ? [a, b] : [b, a];
            for (let i = lo; i <= hi; i++) {
              if (!selectedIds.has(rows[i].id)) onToggleSelect(rows[i].id);
            }
          }
        } else if (focusedId) {
          onToggleSelect(focusedId);
          anchorIdRef.current = focusedId;
        }
        e.preventDefault();
        return;
      }
      if (e.key === "/") {
        if (onFocusSearch) {
          onFocusSearch();
          e.preventDefault();
        }
        return;
      }
      if (e.key === "n") {
        if (onFocusNotes) {
          onFocusNotes();
          e.preventDefault();
        }
        return;
      }
      if (e.key === "?") {
        setShowHelp(true);
        e.preventDefault();
        return;
      }

      // Tab-specific shortcuts. Single-character keys; honor exact key (no shift).
      if (keyboardShortcuts) {
        const match = keyboardShortcuts.find((s) => s.key === e.key);
        if (match) {
          match.handler({ focusedItem, selectedIds });
          e.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    rows,
    focusedId,
    focusedItem,
    selectedIds,
    onFocus,
    onToggleSelect,
    onFocusSearch,
    onFocusNotes,
    keyboardShortcuts,
    showHelp,
  ]);

  return (
    <div id={id} className={cn("flex flex-col gap-3", className)}>
      {/* Chips + toolbar share one row when both present */}
      {(chips || toolbar) && (
        <div className="flex items-center gap-3 flex-wrap">
          {chips && <div className="min-w-0 flex-1 overflow-x-auto">{chips}</div>}
          {toolbar && <div className="shrink-0">{toolbar}</div>}
        </div>
      )}

      {/* Bulk action bar — only when selection ≥ 1 */}
      {bulkBar !== null && bulkBar}

      {/* Empty state replaces list+detail when there are no rows */}
      {rows.length === 0 && emptyState ? (
        emptyState
      ) : (
      /* Split list / detail */
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
        {/* Left: list */}
        <div className="lg:col-span-5 lg:border-r lg:border-border lg:pr-4 overflow-hidden flex flex-col">
          <ListHeader
            selectedCount={selectedIds.size}
            totalLoaded={totalLoaded}
            totalAvailable={totalAvailable}
            allLoadedSelected={selectedIds.size > 0 && selectedIds.size === totalLoaded}
            onSelectAll={onSelectAll}
            legend={legend}
          />
          <div className="divide-y divide-border max-h-[640px] overflow-y-auto">
            {rows.map((row) => (
              <div
                key={row.id}
                onClick={() => onFocus(row.id)}
                className={cn(
                  "cursor-pointer hover:bg-secondary/40 transition-colors",
                  focusedId === row.id && "bg-secondary/60",
                )}
              >
                {renderRow(row, {
                  selected: selectedIds.has(row.id),
                  focused: focusedId === row.id,
                })}
              </div>
            ))}
            <ScrollSentinel
              hasMore={totalLoaded < totalAvailable}
              isLoadingMore={isLoadingMore}
              onLoadMore={onLoadMore}
            />
          </div>
          {(keyboardHints || keyboardShortcuts) && (
            <div className="border-t border-border bg-secondary/30 px-3 py-2 text-[11px] text-muted-foreground flex items-center justify-between">
              <span>{keyboardHints}</span>
              <button
                type="button"
                onClick={() => setShowHelp(true)}
                className="hover:text-foreground transition-colors"
                title="Keyboard shortcuts"
              >
                <Kbd>?</Kbd> shortcuts
              </button>
            </div>
          )}
        </div>

        {/* Right: detail (lg+ shown side-by-side; below lg stacks below the list) */}
        <aside className="lg:col-span-7 lg:pl-4">
          {focusedItem
            ? renderDetail(focusedItem)
            : renderEmptyDetail
              ? renderEmptyDetail()
              : <DefaultEmptyDetail />}
        </aside>
      </div>
      )}

      {showHelp && (
        <KeyboardHelpDialog
          shortcuts={keyboardShortcuts ?? []}
          hasNotes={!!onFocusNotes}
          hasSearch={!!onFocusSearch}
          onClose={() => setShowHelp(false)}
        />
      )}
    </div>
  );
}

/* ---------- Keyboard help dialog ---------- */

function KeyboardHelpDialog<T>({
  shortcuts,
  hasNotes,
  hasSearch,
  onClose,
}: {
  shortcuts: ShortcutDef<T>[];
  hasNotes: boolean;
  hasSearch: boolean;
  onClose: () => void;
}) {
  const builtIn: { key: string; description: string }[] = [
    { key: "j  /  ↓", description: "Next row" },
    { key: "k  /  ↑", description: "Previous row" },
    { key: "x", description: "Toggle select on focused row" },
    { key: "Shift+x", description: "Range select from anchor to focused" },
  ];
  if (hasSearch) builtIn.push({ key: "/", description: "Focus search" });
  if (hasNotes) builtIn.push({ key: "n", description: "Focus notes editor" });
  builtIn.push({ key: "?", description: "Open this dialog" });
  builtIn.push({ key: "Esc", description: "Close dialog" });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
        </div>
        <div className="p-4 space-y-3">
          <Section title="Navigation">
            {builtIn.map((s) => (
              <Row key={s.key} keys={s.key} description={s.description} />
            ))}
          </Section>
          {shortcuts.length > 0 && (
            <Section title="Actions on this tab">
              {shortcuts.map((s) => (
                <Row
                  key={s.key}
                  keys={s.display ?? s.key}
                  description={s.description}
                />
              ))}
            </Section>
          )}
        </div>
        <div className="border-t border-border px-4 py-2 flex justify-end">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-md border border-border bg-background hover:bg-secondary transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ keys, description }: { keys: string; description: string }) {
  // Split on "/" or "+" to render each key as its own kbd.
  const parts = keys.split(/(\s+\/\s+|\s*\+\s*)/);
  return (
    <div className="flex items-center justify-between gap-3 text-[12px]">
      <div className="flex items-center gap-1">
        {parts.map((p, i) => {
          const isSep = /^\s*[/+]\s*$/.test(p) || /\s+\/\s+/.test(p);
          return isSep
            ? <span key={i} className="text-muted-foreground/60 mx-0.5">{p.trim() || "/"}</span>
            : <Kbd key={i}>{p}</Kbd>;
        })}
      </div>
      <span className="text-muted-foreground">{description}</span>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[10px] px-1 py-0.5 border border-border border-b-2 rounded bg-background text-muted-foreground">
      {children}
    </span>
  );
}

/* ---------- Subcomponents ---------- */

function ListHeader(props: {
  selectedCount: number;
  totalLoaded: number;
  totalAvailable: number;
  allLoadedSelected: boolean;
  onSelectAll?: () => void;
  legend?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/20">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        {props.onSelectAll && (
          <input
            type="checkbox"
            className="rounded border-border"
            checked={props.allLoadedSelected}
            onChange={props.onSelectAll}
          />
        )}
        <span>
          {props.selectedCount > 0 && (
            <>
              <span className="font-medium text-foreground">{props.selectedCount}</span> selected ·{" "}
            </>
          )}
          Showing <span className="font-medium text-foreground">{props.totalLoaded}</span> of{" "}
          <span className="tabular-nums">{props.totalAvailable}</span>
        </span>
      </label>
      {props.legend && <div className="flex items-center gap-3">{props.legend}</div>}
    </div>
  );
}

function ScrollSentinel(props: {
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void | Promise<void>;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!props.hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        // Debounce 200ms to avoid double-fire on fast scrolls.
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          if (!props.isLoadingMore) void props.onLoadMore();
        }, 200);
      },
      { threshold: SCROLL_LOAD_THRESHOLD },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [props.hasMore, props.isLoadingMore, props.onLoadMore]);

  if (!props.hasMore && !props.isLoadingMore) return null;

  return (
    <div
      ref={sentinelRef}
      className="px-3 py-3 flex items-center justify-center gap-2 text-[11px] text-muted-foreground bg-secondary/20"
    >
      {props.isLoadingMore ? (
        <>
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>Loading more…</span>
        </>
      ) : (
        <span>Scroll to load more</span>
      )}
    </div>
  );
}

function DefaultEmptyDetail() {
  return (
    <div className="flex h-full min-h-[300px] items-center justify-center text-center px-6">
      <p className="text-xs text-muted-foreground">Select a row to view details.</p>
    </div>
  );
}
