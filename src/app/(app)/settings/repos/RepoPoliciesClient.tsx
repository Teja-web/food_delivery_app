"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Folder, Globe2, ShieldOff, Eye, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { setRepoPolicyAction } from "@/actions/repo-policies";

type Policy = "read-write" | "read-only" | "deny";

interface Row {
  id: string;
  remoteCanonical: string;
  policy: Policy;
  projectId: string | null;
  updatedAtIso: string;
  updatedByName: string | null;
}

const POLICY_TONE: Record<Policy, string> = {
  "read-write": "border-trend-up/40 bg-trend-up/10 text-trend-up",
  "read-only": "border-state-pending/40 bg-state-pending/10 text-state-pending",
  deny: "border-state-failed/40 bg-state-failed/10 text-state-failed",
};

const POLICY_ICON: Record<Policy, typeof Pencil> = {
  "read-write": Pencil,
  "read-only": Eye,
  deny: ShieldOff,
};

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

export function RepoPoliciesClient({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tweaking, setTweaking] = useState<string | null>(null);

  function setPolicy(remoteCanonical: string, policy: Policy) {
    setTweaking(remoteCanonical);
    startTransition(async () => {
      try {
        await setRepoPolicyAction(remoteCanonical, policy);
        router.refresh();
      } finally {
        setTweaking(null);
      }
    });
  }

  // Aggregate counts for the strip at top
  const counts = rows.reduce(
    (acc, r) => {
      acc[r.policy] += 1;
      return acc;
    },
    { "read-write": 0, "read-only": 0, deny: 0 } as Record<Policy, number>,
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {(["read-write", "read-only", "deny"] as const).map((p) => {
          const Icon = POLICY_ICON[p];
          return (
            <Card key={p} className="bg-card/40">
              <CardHeader className="pb-2">
                <CardTitle
                  className={cn(
                    "flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em]",
                    POLICY_TONE[p].split(" ").find((c) => c.startsWith("text-")),
                  )}
                >
                  <Icon className="h-3 w-3" aria-hidden />
                  {p}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 font-display text-2xl font-bold tabular-nums">
                {counts[p]}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-[minmax(0,1.6fr)_140px_120px_140px] items-center gap-3 border-b bg-muted/20 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            <span>Canonical remote</span>
            <span>Policy</span>
            <span>Linked project</span>
            <span className="text-right">Updated</span>
          </div>
          {rows.map((row) => {
            const Icon = POLICY_ICON[row.policy];
            return (
              <div
                key={row.id}
                className="grid grid-cols-[minmax(0,1.6fr)_140px_120px_140px] items-center gap-3 border-b border-border/40 px-4 py-2.5 last:border-b-0 hover:bg-muted/30"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Globe2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate font-mono text-[12px] text-foreground">
                      {row.remoteCanonical}
                    </span>
                  </div>
                </div>
                <div>
                  <Select
                    value={row.policy}
                    onValueChange={(v) => setPolicy(row.remoteCanonical, v as Policy)}
                    disabled={pending && tweaking === row.remoteCanonical}
                  >
                    <SelectTrigger className="h-7 text-[12px]">
                      <SelectValue>
                        <span className="inline-flex items-center gap-1.5">
                          <Icon className="h-3 w-3" aria-hidden />
                          {row.policy}
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="read-write">read-write</SelectItem>
                      <SelectItem value="read-only">read-only</SelectItem>
                      <SelectItem value="deny">deny</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  {row.projectId ? (
                    <a
                      href={`/projects/${row.projectId}`}
                      className="inline-flex items-center gap-1 font-mono text-[11px] text-foreground/85 hover:underline"
                    >
                      <Folder className="h-3 w-3" aria-hidden />
                      {row.projectId.slice(0, 8)}
                    </a>
                  ) : (
                    <span className="font-mono text-[11px] text-muted-foreground/60">—</span>
                  )}
                </div>
                <div className="text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                  {relativeTime(row.updatedAtIso)}
                  {row.updatedByName ? (
                    <div className="text-[10px] opacity-70">{row.updatedByName}</div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground/70">
        Enforcement: <code>deny</code> rejects <code>session_start</code> with{" "}
        <Badge variant="outline" className="font-mono text-[10px]">
          repo_denied
        </Badge>
        ; <code>read-only</code> blocks write verbs with{" "}
        <Badge variant="outline" className="font-mono text-[10px]">
          repo_read_only
        </Badge>
        ; <code>read-write</code> permits all verbs subject to autonomy and rule checks.
      </p>
    </div>
  );
}
