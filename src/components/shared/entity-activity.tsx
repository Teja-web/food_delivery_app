"use client";

import { useState, useTransition, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock,
  Lightbulb,
  Loader2,
  MessageSquare,
  Send,
} from "lucide-react";
import { addEntityNote, fetchEntityNotes } from "@/actions/entity-notes";
import type { EntityNoteType } from "@/db/schema/entity-notes";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

// --- Types ------------------------------------------------------------------

interface TriageEntry {
  id: string;
  type: string;
  urgency: string;
  title: string;
  subtitle: string | null;
  action: string | null;
  status: string;
  createdAt: string;
}

interface NoteEntry {
  id: string;
  body: string;
  createdByName: string | null;
  createdAt: string;
}

type TimelineItem =
  | { type: "triage"; data: TriageEntry }
  | { type: "note"; data: NoteEntry };

interface EntityActivityProps {
  entries: TriageEntry[];
  entityType?: EntityNoteType;
  entityId?: string;
  className?: string;
  limit?: number;
}

// --- Helpers ----------------------------------------------------------------

function relativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function mergeTimeline(entries: TriageEntry[], notes: NoteEntry[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...entries.map((e) => ({ type: "triage" as const, data: e })),
    ...notes.map((n) => ({ type: "note" as const, data: n })),
  ];
  items.sort((a, b) => new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime());
  return items;
}

function triageLineColor(item: TriageEntry) {
  if (item.status === "resolved") return "bg-border/40";
  if (item.urgency === "high" || item.urgency === "critical") return "bg-red-200 dark:bg-red-900/30";
  if (item.urgency === "medium") return "bg-amber-200 dark:bg-amber-900/30";
  return "bg-border";
}

// --- Note Form --------------------------------------------------------------

function NoteForm({
  entityType,
  entityId,
  onAdded,
}: {
  entityType: EntityNoteType;
  entityId: string;
  onAdded: (note: NoteEntry) => void;
}) {
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;

    startTransition(async () => {
      const note = await addEntityNote(entityType, entityId, trimmed);
      onAdded({
        id: note.id,
        body: note.body,
        createdByName: note.createdByName,
        createdAt: note.createdAt?.toISOString() ?? new Date().toISOString(),
      });
      setBody("");
    });
  };

  return (
    <div className="mb-6">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a note..."
        rows={3}
        className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 resize-none transition-colors"
      />
      <div className="flex justify-end mt-2">
        <Button
          variant="default"
          onClick={handleSubmit}
          disabled={isPending || !body.trim()}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium hover:opacity-90 transition-opacity disabled:opacity-30"
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Send className="h-3 w-3" />
          )}
          Add note
        </Button>
      </div>
    </div>
  );
}

// --- Timeline Node ----------------------------------------------------------

function TimelineNode({
  item,
  isLast,
}: {
  item: TimelineItem;
  isLast: boolean;
}) {
  if (item.type === "note") {
    return (
      <div className="relative flex gap-4">
        {/* Vertical line + dot */}
        <div className="flex flex-col items-center">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/10">
            <MessageSquare className="h-3 w-3 text-sky-500" />
          </div>
          {!isLast && <div className="w-px flex-1 bg-border/60 mt-1" />}
        </div>

        {/* Content */}
        <div className={cn("min-w-0 flex-1", !isLast && "pb-5")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap">{item.data.body}</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {item.data.createdByName ?? "Unknown"}
              </p>
            </div>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground pt-0.5">
              {relativeAge(item.data.createdAt)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Triage item
  const entry = item.data;
  const isHigh = entry.urgency === "high" || entry.urgency === "critical";
  const isMedium = entry.urgency === "medium";
  const isResolved = entry.status === "resolved";
  const lineColor = triageLineColor(entry);

  const Icon = isResolved
    ? CheckCircle2
    : isHigh
      ? AlertTriangle
      : isMedium
        ? CircleAlert
        : Lightbulb;

  const iconColor = isResolved
    ? "text-muted-foreground/40"
    : isHigh
      ? "text-red-500"
      : "text-amber-500";

  const dotBg = isResolved
    ? "bg-muted/50"
    : isHigh
      ? "bg-red-50 dark:bg-red-950/40"
      : isMedium
        ? "bg-amber-50 dark:bg-amber-950/40"
        : "bg-amber-50 dark:bg-amber-950/30";

  return (
    <div className="relative flex gap-4">
      {/* Vertical line + dot */}
      <div className="flex flex-col items-center">
        <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full", dotBg)}>
          <Icon className={cn("h-3 w-3", iconColor)} />
        </div>
        {!isLast && <div className={cn("w-px flex-1 mt-1", lineColor)} />}
      </div>

      {/* Content */}
      <div className={cn("min-w-0 flex-1", !isLast && "pb-5")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className={cn(
              "text-xs font-medium leading-snug",
              isResolved ? "text-muted-foreground" : "text-foreground",
            )}>
              {entry.title}
            </p>
            {entry.subtitle && (
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{entry.subtitle}</p>
            )}
            {entry.action && !isResolved && (
              <p className={cn(
                "mt-1.5 flex items-center gap-1 text-[11px] font-medium",
                isHigh ? "text-red-600 dark:text-red-400" : isMedium ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
              )}>
                <ArrowRight className="h-2.5 w-2.5" />
                {entry.action}
              </p>
            )}
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground pt-0.5">
            {relativeAge(entry.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

// --- Component --------------------------------------------------------------

export function EntityActivity({ entries, entityType, entityId, className, limit = 15 }: EntityActivityProps) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const notesEnabled = Boolean(entityType && entityId);

  useEffect(() => {
    if (!entityType || !entityId) return;
    fetchEntityNotes(entityType, entityId).then((rows) =>
      setNotes(
        rows.map((r) => ({
          id: r.id,
          body: r.body,
          createdByName: r.createdByName,
          createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
        })),
      ),
    );
  }, [entityType, entityId]);

  const timeline = mergeTimeline(entries, notes);
  const visible = expanded ? timeline : timeline.slice(0, limit);
  const hasMore = timeline.length > limit;

  const handleNoteAdded = (note: NoteEntry) => {
    setNotes((prev) => [note, ...prev]);
  };

  if (timeline.length === 0 && !notesEnabled) {
    return (
      <div className={cn("flex flex-col items-center gap-3 py-10 text-center", className)}>
        <Clock className="h-6 w-6 text-muted-foreground/25" />
        <div>
          <p className="text-xs font-semibold text-foreground">Nothing here yet</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Events will appear here as things happen.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(className)}>
      {/* Note form */}
      {notesEnabled && (
        <NoteForm entityType={entityType!} entityId={entityId!} onAdded={handleNoteAdded} />
      )}

      {/* Timeline */}
      <div>
        {visible.map((item, idx) => (
          <TimelineNode
            key={item.data.id}
            item={item}
            isLast={idx === visible.length - 1 && !hasMore}
          />
        ))}
      </div>

      {/* Empty state */}
      {timeline.length === 0 && notesEnabled && (
        <div className="py-8 text-center">
          <p className="text-xs text-muted-foreground">Nothing here yet. Add a note to get started.</p>
        </div>
      )}

      {hasMore && !expanded && (
        <Button
          variant="ghost"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center justify-center gap-1.5 mt-3 py-2.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
        >
          <ChevronDown className="h-3 w-3" />
          Show {timeline.length - limit} more
        </Button>
      )}
    </div>
  );
}