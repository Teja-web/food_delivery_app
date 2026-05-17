"use client";

import Link from "next/link";
import { Bell, BellOff, Check } from "lucide-react";
import { useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { markAllRead, markRead } from "@/actions/notifications";
import { cn } from "@/lib/utils";

import type { NotificationClient } from "./serialize";

const ENTITY_LABEL: Record<string, string> = {
  plan: "Plan",
  phase_gate: "Phase gate",
  approval: "Approval",
  release: "Release",
  work_item: "Work item",
  skill_outcome: "Skill outcome",
  deployment: "Deployment",
  project: "Project",
};

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationsClient({ items }: { items: NotificationClient[] }) {
  const [pending, startTransition] = useTransition();
  const unread = items.filter((i) => !i.read);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" aria-hidden />
            <h1 className="font-display text-2xl font-semibold tracking-tight">Notifications</h1>
            {unread.length > 0 ? (
              <Badge variant="outline" className="border-primary/40 px-1.5 py-0 font-mono text-[10px] uppercase text-primary">
                {unread.length} unread
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            System events from the audit log + delivery queue. Live-updated via SSE.
          </p>
        </div>
        {unread.length > 0 ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => startTransition(() => markAllRead())}
          >
            <Check className="h-3.5 w-3.5" aria-hidden /> Mark all read
          </Button>
        ) : null}
      </header>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
              <BellOff className="h-6 w-6 text-muted-foreground/60" aria-hidden />
              <p className="text-sm text-muted-foreground">
                Nothing here yet. Notifications fire when approvals change state, gates fail, or skills
                produce outcomes.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {items.map((n) => {
                const inner = (
                  <div className="flex items-start gap-3 px-4 py-3">
                    <div
                      className={cn(
                        "mt-1 h-2 w-2 shrink-0 rounded-full",
                        n.read ? "bg-border" : "bg-primary",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        {n.entityType ? (
                          <Badge variant="outline" className="px-1.5 py-0 font-mono text-[10px] uppercase">
                            {ENTITY_LABEL[n.entityType] ?? n.entityType.replace(/_/g, " ")}
                          </Badge>
                        ) : null}
                        {n.subject ? (
                          <span className={cn("text-sm font-medium", n.read && "text-muted-foreground")}>
                            {n.subject}
                          </span>
                        ) : null}
                      </div>
                      <p
                        className={cn(
                          "mt-0.5 text-sm",
                          n.read ? "text-muted-foreground" : "text-foreground/85",
                        )}
                      >
                        {n.body}
                      </p>
                      <div className="mt-1 flex items-center gap-3 font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
                        <span>{formatRelative(n.createdAt)}</span>
                        <span>· via {n.channel.replace("_", " ")}</span>
                      </div>
                    </div>
                    {!n.read ? (
                      <button
                        type="button"
                        className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
                        disabled={pending}
                        onClick={(e) => {
                          e.preventDefault();
                          startTransition(() => markRead(n.id));
                        }}
                      >
                        Mark read
                      </button>
                    ) : null}
                  </div>
                );

                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link href={n.link} className="block hover:bg-muted/30">
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
