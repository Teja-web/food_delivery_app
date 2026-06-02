"use client";

import { CheckCircle2, Download, FileJson, FileLock2, Filter, ShieldAlert, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { buildEvidencePacketAction, verifyAuditChainAction } from "@/actions/audit/audit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ChainVerification } from "@/operations/audit/audit-chain";

import type { AuditPageClient, AuditRowClient } from "./serialize";

const SCOPES = [
  { id: "all", label: "All events" },
  { id: "skills", label: "Skills" },
  { id: "plans", label: "Plans" },
  { id: "projects", label: "Projects" },
  { id: "approvals", label: "Approvals" },
  { id: "deployments", label: "Deployments" },
] as const;

const ACTORS = [
  { id: "any", label: "Any actor" },
  { id: "user", label: "User" },
  { id: "system", label: "System" },
  { id: "integration", label: "Integration" },
  { id: "api", label: "API" },
] as const;

const RANGES = [
  { id: "24h", label: "Last 24h" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
] as const;

const TONE_CLASS: Record<AuditRowClient["actionTone"], string> = {
  neutral: "border-border/60 bg-muted/40 text-muted-foreground",
  success: "border-trend-up/40 bg-trend-up/10 text-trend-up",
  warn: "border-state-pending/40 bg-state-pending/10 text-state-pending",
  danger: "border-state-failed/40 bg-state-failed/10 text-state-failed",
};

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card className="bg-card/40">
      <CardContent className="space-y-1 pt-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </div>
        <div className="flex items-baseline justify-between">
          <span className="font-display text-2xl font-bold tabular-nums">{value}</span>
          {hint ? <span className="font-mono text-[10px] text-muted-foreground">{hint}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ChipRow({
  id,
  active,
  onClick,
  children,
}: {
  id: string;
  active: boolean;
  onClick: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="unstyled"
      size="auto"
      onClick={() => onClick(id)}
      className={cn(
        "rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors",
        active
          ? "border-foreground/40 bg-foreground/5 text-foreground"
          : "border-border/60 bg-transparent text-muted-foreground hover:bg-muted/50",
      )}
    >
      {children}
    </Button>
  );
}

export function AuditClient({ data }: { data: AuditPageClient }) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [exporting, setExporting] = useState(false);
  const [chainStatus, setChainStatus] = useState<ChainVerification | null>(null);
  const [verifying, setVerifying] = useState(false);

  const runVerify = async () => {
    setVerifying(true);
    try {
      const result = await verifyAuditChainAction();
      setChainStatus(result);
    } finally {
      setVerifying(false);
    }
  };

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    startTransition(() => router.push(`/audit?${next.toString()}`));
  };

  const downloadCsv = () => {
    const csv = buildCsv(data.rows);
    triggerDownload(`coznt-audit-${data.query.range}-${data.query.scope}-${Date.now()}.csv`, csv, "text/csv");
  };

  const downloadJson = () => {
    setExporting(true);
    const payload = {
      generated_at: new Date().toISOString(),
      query: data.query,
      totals: data.totals,
      rows: data.rows.map((r) => ({
        id: r.id,
        occurred_at: r.occurredAtIso,
        source: r.source,
        action: r.action,
        actor_type: r.actorType,
        actor_name: r.actorName,
        entity_type: r.entityType,
        entity_id: r.entityId,
        entity_label: r.entityLabel,
        project: r.projectName,
        summary: r.summary,
        verdict: r.verdict,
        severity: r.severity,
        signature: r.signature,
      })),
    };
    triggerDownload(
      `coznt-audit-${data.query.range}-${data.query.scope}-${Date.now()}.json`,
      JSON.stringify(payload, null, 2),
      "application/json",
    );
    setExporting(false);
  };

  const downloadEvidencePacket = async () => {
    setExporting(true);
    try {
      const packet = await buildEvidencePacketAction({
        scope: data.query.scope as never,
        from: new Date(data.query.from),
        to: new Date(data.query.to),
        actorType: data.query.actorType === "any" ? undefined : (data.query.actorType as never),
      });
      triggerDownload(
        `coznt-evidence-${data.query.range}-${data.query.scope}-${Date.now()}.json`,
        JSON.stringify(packet, null, 2),
        "application/json",
      );
    } finally {
      setExporting(false);
    }
  };

  const actorBreakdown = useMemo(() => {
    const entries = Object.entries(data.totals.byActorType);
    if (entries.length === 0) return "—";
    return entries.map(([k, v]) => `${k} ${v}`).join(" · ");
  }, [data.totals.byActorType]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Audit log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Parameterized query of every domain state change and skill outcome.
            Reproducible exports (same params → same output) for compliance review.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={downloadCsv} disabled={isPending}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={downloadJson} disabled={isPending || exporting}>
            <FileJson className="h-3.5 w-3.5" aria-hidden />
            JSON
          </Button>
          <Button
            size="sm"
            onClick={downloadEvidencePacket}
            disabled={isPending || exporting}
            title="Tamper-evident export with chain head + verification receipt"
          >
            <FileLock2 className="h-3.5 w-3.5" aria-hidden />
            Evidence packet
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Events" value={data.totals.rows} hint={data.query.range} />
        <StatTile label="Domain changes" value={data.totals.bySource.audit_log} />
        <StatTile label="Skill outcomes" value={data.totals.bySource.skill_outcome} />
        <StatTile
          label="Flagged"
          value={data.totals.incidents}
          hint={data.totals.incidents > 0 ? "rolled_back / incident" : "clean window"}
        />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Window
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {RANGES.map((r) => (
                <ChipRow
                  key={r.id}
                  id={r.id}
                  active={data.query.range === r.id}
                  onClick={(v) => updateParam("range", v)}
                >
                  {r.label}
                </ChipRow>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Scope
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {SCOPES.map((s) => (
                <ChipRow
                  key={s.id}
                  id={s.id}
                  active={data.query.scope === s.id}
                  onClick={(v) => updateParam("scope", v)}
                >
                  {s.label}
                </ChipRow>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Actor
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {ACTORS.map((a) => (
                <ChipRow
                  key={a.id}
                  id={a.id}
                  active={data.query.actorType === a.id}
                  onClick={(v) => updateParam("actor", v)}
                >
                  {a.label}
                </ChipRow>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="h-3 w-3" aria-hidden />
          <span>
            {data.totals.rows} event{data.totals.rows === 1 ? "" : "s"} · {actorBreakdown}
          </span>
        </div>
      </div>

      {data.rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-hidden rounded-md border border-border/60">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Actor</th>
                <th className="px-4 py-2 font-medium">Entity</th>
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 font-medium">Summary</th>
                <th className="px-4 py-2 text-right font-medium">Signature</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} className="border-b border-border/40 hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-2 align-top">
                    <div className="text-sm tabular-nums">{row.occurredAtLabel}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {new Date(row.occurredAtIso).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-2 align-top">
                    <Badge variant="outline" className={cn("font-mono text-[10px]", TONE_CLASS[row.actionTone])}>
                      {row.action}
                    </Badge>
                    {row.verdict ? (
                      <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {row.verdict}
                        {row.severity ? ` · ${row.severity}` : ""}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 align-top">
                    <div className="text-sm">{row.actorName}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{row.actorType}</div>
                  </td>
                  <td className="px-4 py-2 align-top">
                    <div className="text-sm">
                      {row.entityLabel ?? <span className="text-muted-foreground">{row.entityType}</span>}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {row.entityType}
                      {row.entityId ? ` · ${row.entityId.slice(0, 8)}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-2 align-top text-sm">
                    {row.projectName ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2 align-top text-sm">
                    <span className="line-clamp-2 text-foreground/85">
                      {row.summary ?? <span className="text-muted-foreground">—</span>}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right align-top font-mono text-[10px] text-muted-foreground">
                    {row.signature}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="space-y-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Each row's <span className="font-mono">row_hash</span> = sha256(<span className="font-mono">prev_hash</span> ‖ canonical fields).
              Tamper with any row and every subsequent row's hash diverges — verifiable here or via
              <span className="font-mono"> POST /api/v1/audit/verify</span>.
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={runVerify}
            disabled={verifying}
            className="shrink-0"
          >
            {verifying ? "Verifying…" : "Verify chain"}
          </Button>
        </div>
        {chainStatus ? (
          chainStatus.ok ? (
            <div className="flex items-center gap-2 text-trend-up">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Chain verified · {chainStatus.checked} rows ·{" "}
                {chainStatus.firstAt
                  ? `${new Date(chainStatus.firstAt).toLocaleDateString()} → ${new Date(chainStatus.lastAt ?? chainStatus.firstAt).toLocaleDateString()}`
                  : "empty"}
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-state-failed">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Drift detected at row <span className="font-mono">{chainStatus.drift.rowId.slice(0, 8)}</span>{" "}
                ({chainStatus.drift.reason}) — {new Date(chainStatus.drift.rowCreatedAt).toLocaleString()}.
                Expected <span className="font-mono">{chainStatus.drift.expectedRowHash.slice(0, 12)}</span>,
                got <span className="font-mono">{chainStatus.drift.actualRowHash?.slice(0, 12) ?? "null"}</span>.
              </span>
            </div>
          )
        ) : null}
      </footer>
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <ShieldAlert className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" aria-hidden />
        <div className="text-sm font-medium">No events in this window</div>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Widen the time range or change the scope to see more. Audit rows accumulate as plans
          advance, approvals are decided, and skills fire.
        </p>
      </CardContent>
    </Card>
  );
}

function buildCsv(rows: AuditRowClient[]): string {
  const header = [
    "timestamp",
    "source",
    "action",
    "actor_type",
    "actor",
    "entity_type",
    "entity_id",
    "entity_label",
    "project",
    "summary",
    "verdict",
    "severity",
    "signature",
  ];
  const escape = (v: string | null | undefined): string => {
    if (v == null) return "";
    const s = String(v);
    return s.includes(",") || s.includes("\"") || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = rows.map((r) =>
    [
      r.occurredAtIso,
      r.source,
      r.action,
      r.actorType,
      r.actorName,
      r.entityType,
      r.entityId,
      r.entityLabel,
      r.projectName,
      r.summary,
      r.verdict,
      r.severity,
      r.signature,
    ]
      .map(escape)
      .join(","),
  );
  return `${header.join(",")}\n${lines.join("\n")}\n`;
}

function triggerDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
