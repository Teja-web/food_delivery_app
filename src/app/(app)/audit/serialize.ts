import type { UnifiedAuditRow } from "@/operations/audit/audit";

export type AuditRowClient = {
  id: string;
  occurredAtIso: string;
  occurredAtLabel: string;
  source: "audit_log" | "skill_outcome";
  actorType: string;
  actorName: string;
  action: string;
  actionTone: "neutral" | "success" | "warn" | "danger";
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  projectName: string | null;
  summary: string | null;
  severity: string | null;
  verdict: string | null;
  signature: string;
};

export type AuditPageClient = {
  rows: AuditRowClient[];
  query: {
    scope: string;
    from: string;
    to: string;
    actorType: string;
    range: "24h" | "7d" | "30d" | "90d";
  };
  totals: {
    rows: number;
    bySource: { audit_log: number; skill_outcome: number };
    byActorType: Record<string, number>;
    incidents: number;
  };
};

function actionTone(action: string, verdict: string | null, severity: string | null): AuditRowClient["actionTone"] {
  if (verdict === "incident" || severity === "critical") return "danger";
  if (verdict === "rolled_back" || severity === "high") return "danger";
  if (action.includes("demotion") || action.includes("violation") || action.includes("rejected")) return "danger";
  if (action.includes("promotion") || action.includes("approved") || verdict === "success") return "success";
  if (action.includes("advance") || action.includes("review")) return "warn";
  return "neutral";
}

function formatRelative(date: Date): string {
  const ms = Date.now() - date.getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function serializeAuditRow(row: UnifiedAuditRow): AuditRowClient {
  return {
    id: row.id,
    occurredAtIso: row.occurredAt.toISOString(),
    occurredAtLabel: formatRelative(row.occurredAt),
    source: row.source,
    actorType: row.actorType,
    actorName: row.actorName ?? "—",
    action: row.action,
    actionTone: actionTone(row.action, row.verdict, row.severity),
    entityType: row.entityType,
    entityId: row.entityId,
    entityLabel: row.entityLabel,
    projectName: row.projectName,
    summary: row.summary,
    severity: row.severity,
    verdict: row.verdict,
    signature: row.signature,
  };
}
