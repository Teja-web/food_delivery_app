"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pin, PinOff, Trash2, Plus, Lightbulb } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  createProjectLearningAction,
  setProjectLearningPinAction,
  softDeleteProjectLearningAction,
} from "@/actions/project-learnings";

interface LearningClient {
  id: string;
  body: string;
  pinOrder: number | null;
  createdAt: string;
  createdByName: string | null;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function LearningsCard({
  projectId,
  learnings,
}: {
  projectId: string;
  learnings: LearningClient[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body = draft.trim();
    if (body.length === 0) {
      setError("Learning body is required");
      return;
    }
    startTransition(async () => {
      try {
        await createProjectLearningAction({ projectId, body });
        setDraft("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add learning");
      }
    });
  }

  function togglePin(id: string, isPinned: boolean) {
    startTransition(async () => {
      await setProjectLearningPinAction(id, projectId, isPinned ? null : 1);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this learning? It will be removed from get_my_context.")) return;
    startTransition(async () => {
      await softDeleteProjectLearningAction(id, projectId);
      router.refresh();
    });
  }

  const pinned = learnings.filter((l) => l.pinOrder !== null);
  const unpinned = learnings.filter((l) => l.pinOrder === null);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Lightbulb className="h-3 w-3" aria-hidden />
            Learnings · {learnings.length}
          </span>
          <span className="text-[10px] normal-case tracking-normal text-muted-foreground/80">
            surfaced in every <code className="font-mono">get_my_context</code>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <p className="text-xs text-muted-foreground">
          Short operator-authored notes the AI sees at the top of every MCP session. Use for
          project-specific context the choreographies don&apos;t carry — vendor quirks, deferred
          decisions, named-owner reminders. Searchable via{" "}
          <code className="font-mono">search_learnings</code>.
        </p>

        <form onSubmit={add} className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Payments service requires CSO sign-off before any merge to main."
            rows={2}
            disabled={pending}
            className="font-mono text-[12px]"
          />
          <div className="flex items-center justify-between gap-2">
            {error ? (
              <span className="text-[11px] text-destructive">{error}</span>
            ) : (
              <span className="text-[11px] text-muted-foreground/70">
                Pin (`pinOrder = 1`) to float above unpinned learnings everywhere — UI, MCP,
                search.
              </span>
            )}
            <Button type="submit" size="sm" disabled={pending || draft.trim().length === 0}>
              <Plus className="mr-1 h-3 w-3" aria-hidden /> Add
            </Button>
          </div>
        </form>

        {learnings.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 px-4 py-6 text-center text-xs text-muted-foreground">
            No learnings recorded yet. Authoring the first one teaches the AI something its
            choreography body doesn&apos;t carry.
          </div>
        ) : (
          <div className="space-y-3">
            {pinned.length > 0 ? (
              <div className="space-y-1.5">
                <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  Pinned · {pinned.length}
                </div>
                {pinned.map((l) => (
                  <LearningRow
                    key={l.id}
                    learning={l}
                    pending={pending}
                    onPin={() => togglePin(l.id, true)}
                    onRemove={() => remove(l.id)}
                  />
                ))}
              </div>
            ) : null}
            {unpinned.length > 0 ? (
              <div className="space-y-1.5">
                {pinned.length > 0 ? (
                  <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    Recent · {unpinned.length}
                  </div>
                ) : null}
                {unpinned.map((l) => (
                  <LearningRow
                    key={l.id}
                    learning={l}
                    pending={pending}
                    onPin={() => togglePin(l.id, false)}
                    onRemove={() => remove(l.id)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LearningRow({
  learning,
  pending,
  onPin,
  onRemove,
}: {
  learning: LearningClient;
  pending: boolean;
  onPin: () => void;
  onRemove: () => void;
}) {
  const isPinned = learning.pinOrder !== null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-border/40 bg-card/30 px-3 py-2">
      <Lightbulb
        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isPinned ? "text-trend-up" : "text-muted-foreground/60"}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="whitespace-pre-wrap text-[12px] text-foreground/90">{learning.body}</p>
        <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
          <span>{relativeTime(learning.createdAt)}</span>
          {learning.createdByName ? (
            <>
              <span>·</span>
              <span>{learning.createdByName}</span>
            </>
          ) : null}
          {isPinned ? (
            <Badge
              variant="outline"
              className="ml-1 border-trend-up/40 px-1.5 py-0 text-[9px] uppercase text-trend-up"
            >
              pinned
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onPin}
          disabled={pending}
          title={isPinned ? "Unpin" : "Pin to top"}
          className="h-7 w-7 p-0"
        >
          {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={pending}
          title="Delete"
          className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
