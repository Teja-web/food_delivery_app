"use client";

/**
 * NotesPanel — inline notes editor for the EntityListDetail right pane.
 *
 * Distinct from <EntityActivity>:
 *   - Notes only (no triage timeline merging)
 *   - Autosave on blur + ⌘⏎ (preserves editor focus during rapid review)
 *   - Scope badge in header (clarifies entityType for application notes)
 *
 * <EntityActivity> stays as-is for Feed tabs where the explicit
 * "Add note" button UX is intentional. Both share the same action
 * layer (addEntityNote / fetchEntityNotes / updateEntityNote).
 *
 * Critical: addEntityNote does NOT call revalidatePath. That guarantee
 * makes autosave-on-blur safe — typing → blur → save does not yank
 * focus mid-keystroke.
 *
 * Cross-user sync: NotesPanel subscribes to useEntityEvent("entityNote")
 * directly (no id filter — the PG trigger emits entityId = note's own id,
 * not the target entity it's attached to, so we filter org-wide and
 * refetch on any note event). entity_notes are wired into the trigger
 * list at scripts/crud-triggers.sql.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { addEntityNote, fetchEntityNotes } from "@/actions/entity-notes";
import type { EntityNoteType } from "@/db/schema/entity-notes";
import type { EntityNote } from "@/db/schema/entity-notes";
import { useEntityEvent } from "@/hooks/use-entity-event";

export type NotesPanelProps = {
  entityType: EntityNoteType;
  entityId: string;
  /** Optional badge in the header (e.g. "On this role") */
  scopeBadge?: string;
  className?: string;
};

type ClientNote = {
  id: string;
  body: string;
  createdByName: string | null;
  createdAt: string;
};

export function NotesPanel({ entityType, entityId, scopeBadge, className }: NotesPanelProps) {
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset state and fetch on entity change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotes([]);
    setDraft("");

    fetchEntityNotes(entityType, entityId).then((rows) => {
      if (cancelled) return;
      setNotes(rows.map(toClientNote));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  // Cross-user sync: refetch on any entityNote event in the org.
  // No id filter: the PG trigger emits the note's own id, not its target,
  // so we'd miss events otherwise. Cost is small — notes are uncommon and
  // each refetch is one indexed query.
  const refetch = useCallback(() => {
    fetchEntityNotes(entityType, entityId).then((rows) => {
      setNotes(rows.map(toClientNote));
    });
  }, [entityType, entityId]);
  useEntityEvent("entityNote", undefined, refetch);

  // Save on blur or ⌘⏎ (Ctrl+Enter on non-Mac). The unmount path also
  // saves via the blur fallback in handleBeforeUnmount below.
  const flush = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const optimistic: ClientNote = {
      id: `tmp-${Date.now()}`,
      body: trimmed,
      createdByName: "You",
      createdAt: new Date().toISOString(),
    };
    setNotes((prev) => [optimistic, ...prev]);
    setDraft("");

    startTransition(async () => {
      const saved = await addEntityNote(entityType, entityId, trimmed);
      // Replace the optimistic row with the server response (real id, real createdAt).
      setNotes((prev) =>
        prev.map((n) => (n.id === optimistic.id ? toClientNote(saved) : n)),
      );
    });
  };

  // When this component unmounts (e.g. user clicks a different row), flush
  // the pending draft so we never lose work mid-typing. The closure
  // captures the latest draft via a ref so cleanup uses fresh state.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => {
    return () => {
      const trimmed = draftRef.current.trim();
      if (trimmed) {
        // Fire-and-forget; component is unmounting anyway.
        addEntityNote(entityType, entityId, trimmed).catch((err) => {
          console.error("[NotesPanel] flush on unmount failed", err);
        });
      }
    };
    // Intentionally only re-run on entityId change so stable mounts don't trip.
  }, [entityType, entityId]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      flush();
    }
  };

  return (
    <div className={cn("rounded-lg border border-border", className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Notes</span>
          {scopeBadge && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 font-medium"
              title="Scoped to this entity"
            >
              {scopeBadge}
            </span>
          )}
          {!isLoading && (
            <span className="text-[10px] text-muted-foreground font-normal">
              {notes.length === 0 ? "No notes yet" : `${notes.length} ${notes.length === 1 ? "entry" : "entries"}`}
              {notes[0] && ` · last by ${notes[0].createdByName ?? "Unknown"}, ${relativeAge(notes[0].createdAt)}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>Autosaves</span>
          <Kbd>⌘</Kbd>
          <Kbd>⏎</Kbd>
        </div>
      </div>

      {/* Editor */}
      <textarea
        ref={textareaRef}
        data-notes-editor
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={flush}
        onKeyDown={onKeyDown}
        placeholder="Add a note…"
        rows={3}
        className="w-full px-4 py-3 text-sm leading-relaxed bg-background focus:outline-none resize-none border-b border-border"
      />

      {/* Notes list */}
      <div className="max-h-64 overflow-y-auto bg-secondary/10">
        {isLoading ? (
          <NotesSkeleton />
        ) : notes.length === 0 ? (
          <div className="px-4 py-3 text-[12px] text-muted-foreground italic">
            No notes yet — start typing above.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {notes.map((n) => (
              <li
                key={n.id}
                className={cn(
                  "px-4 py-3 space-y-1",
                  n.id.startsWith("tmp-") && "opacity-70",
                )}
              >
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground/80">
                    {n.createdByName ?? "Unknown"}
                  </span>
                  <span className="tabular-nums">{relativeAge(n.createdAt)}</span>
                </div>
                <div className="text-[12px] text-foreground/85 whitespace-pre-wrap">{n.body}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isPending && (
        <div className="border-t border-border bg-secondary/20 px-4 py-1 text-[10px] text-muted-foreground">
          Saving…
        </div>
      )}
    </div>
  );
}

/* ---------- Subcomponents ---------- */

function NotesSkeleton() {
  return (
    <ul className="divide-y divide-border">
      {[0, 1, 2].map((i) => (
        <li key={i} className="px-4 py-3 space-y-2">
          <div className="h-3 w-32 rounded bg-secondary/60 animate-pulse" />
          <div className="h-3 w-full rounded bg-secondary/40 animate-pulse" />
        </li>
      ))}
    </ul>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] px-1 py-0.5 border border-border border-b-2 rounded bg-background text-muted-foreground">
      {children}
    </span>
  );
}

/* ---------- Helpers ---------- */

function toClientNote(n: EntityNote): ClientNote {
  return {
    id: n.id,
    body: n.body,
    createdByName: n.createdByName,
    createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : String(n.createdAt),
  };
}

function relativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
