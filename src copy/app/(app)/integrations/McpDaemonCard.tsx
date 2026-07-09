/**
 * MCP daemon health card — proves the daemon model from positioning.md is
 * working in the field. Pulls from `audit_logs` (mcp.session_start) and
 * `api_keys.lastUsedAt`.
 *
 * Server component — no client interactivity. Click-through to /api-keys
 * for the connect-your-editor panel.
 */

import { CircleCheck, CircleDashed, Plug, Terminal } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const date = new Date(iso);
  const ms = Date.now() - date.getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function McpDaemonCard({
  lastSessionAtIso,
  lastSessionIntent,
  lastKeyUseAtIso,
  activeKeysLast7d,
  everUsedKeys,
  activeKeysTotal,
}: {
  lastSessionAtIso: string | null;
  lastSessionIntent: string | null;
  lastKeyUseAtIso: string | null;
  activeKeysLast7d: number;
  everUsedKeys: number;
  activeKeysTotal: number;
}) {
  const lastKeyMs = lastKeyUseAtIso ? Date.now() - new Date(lastKeyUseAtIso).getTime() : null;
  const healthy = lastKeyMs !== null && lastKeyMs < 24 * 60 * 60 * 1000;
  const stale = lastKeyMs !== null && !healthy;
  const cold = lastKeyMs === null;

  const statusBadge = healthy ? (
    <Badge variant="outline" className="border-trend-up/40 bg-trend-up/10 text-trend-up">
      <CircleCheck className="mr-1 h-3 w-3" aria-hidden /> Active
    </Badge>
  ) : stale ? (
    <Badge variant="outline" className="border-state-pending/40 bg-state-pending/10 text-state-pending">
      <CircleDashed className="mr-1 h-3 w-3" aria-hidden /> Idle
    </Badge>
  ) : (
    <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
      <CircleDashed className="mr-1 h-3 w-3" aria-hidden /> Not yet connected
    </Badge>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Plug className="h-3 w-3" aria-hidden />
            Coznt MCP daemon
          </span>
          {statusBadge}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <p className="text-xs text-muted-foreground">
          The coznt MCP server is the runtime your developers&apos; AI editors connect to. This card
          proves it&apos;s reachable: it surfaces the last session start and the last API key use
          observed by the server. No webhook hop — the data comes from coznt&apos;s own audit log
          and key store.
        </p>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Last MCP call"
            value={relativeTime(lastKeyUseAtIso)}
            hint={lastKeyUseAtIso ? new Date(lastKeyUseAtIso).toLocaleString() : "no calls yet"}
          />
          <Stat
            label="Last session"
            value={relativeTime(lastSessionAtIso)}
            hint={lastSessionIntent ?? (lastSessionAtIso ? "no intent" : "no sessions yet")}
          />
          <Stat
            label="Active keys (7d)"
            value={String(activeKeysLast7d)}
            hint={`${everUsedKeys} ever used`}
          />
          <Stat
            label="Total active keys"
            value={String(activeKeysTotal)}
            hint="non-revoked"
          />
        </div>

        {cold ? (
          <div className="rounded-md border border-border/60 bg-muted/20 p-3">
            <div className="flex items-start gap-2">
              <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="flex-1 space-y-2 text-xs">
                <div className="text-foreground">No MCP calls observed yet.</div>
                <div className="text-muted-foreground">
                  Mint an API key and run <code className="font-mono">coznt connect</code> from a
                  dev machine. The CLI wires up the editor (Cursor / Claude Code / Cline / Zed /
                  Continue) and pulls the project&apos;s choreography bundle.
                </div>
                <Button asChild size="sm" variant="outline" className="mt-1">
                  <Link href="/api-keys">Open API keys</Link>
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {stale ? (
          <div className="rounded-md border border-state-pending/30 bg-state-pending/[0.05] p-3 text-xs text-foreground/85">
            No MCP traffic in the last 24h. If a developer just lost connectivity, the most
            common fix is to restart the editor — the MCP client loads on editor start.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium tabular-nums">{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-muted-foreground" title={hint}>
        {hint}
      </div>
    </div>
  );
}
