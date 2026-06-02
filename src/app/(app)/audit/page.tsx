import { queryAuditLog, AUDIT_SCOPES, type AuditScope } from "@/operations/audit/audit";
import { AUDIT_ACTOR_TYPES, type AuditActorType } from "@/db/schema/audit/audit-log";

import { AuditClient } from "./AuditClient";
import { serializeAuditRow, type AuditPageClient, type AuditRowClient } from "./serialize";

const RANGES = { "24h": 24 * 60 * 60 * 1000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000, "90d": 90 * 86_400_000 } as const;
type Range = keyof typeof RANGES;

function parseRange(v: string | undefined): Range {
  return v === "24h" || v === "7d" || v === "30d" || v === "90d" ? v : "7d";
}

function parseScope(v: string | undefined): AuditScope {
  return (AUDIT_SCOPES as readonly string[]).includes(v ?? "") ? (v as AuditScope) : "all";
}

function parseActor(v: string | undefined): AuditActorType | "any" {
  if (v === "any" || !v) return "any";
  return (AUDIT_ACTOR_TYPES as readonly string[]).includes(v) ? (v as AuditActorType) : "any";
}

export default async function SkillsAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; scope?: string; actor?: string }>;
}) {
  const sp = await searchParams;
  const range = parseRange(sp.range);
  const scope = parseScope(sp.scope);
  const actor = parseActor(sp.actor);

  const to = new Date();
  const from = new Date(Date.now() - RANGES[range]);

  const rawRows = await queryAuditLog({
    scope,
    from,
    to,
    actorType: actor === "any" ? undefined : actor,
    limit: 500,
  });

  const rows: AuditRowClient[] = rawRows.map(serializeAuditRow);

  const bySource = { audit_log: 0, skill_outcome: 0 } as { audit_log: number; skill_outcome: number };
  const byActor: Record<string, number> = {};
  let incidents = 0;
  for (const r of rows) {
    bySource[r.source] += 1;
    byActor[r.actorType] = (byActor[r.actorType] ?? 0) + 1;
    if (r.actionTone === "danger") incidents += 1;
  }

  const data: AuditPageClient = {
    rows,
    query: {
      scope,
      from: from.toISOString(),
      to: to.toISOString(),
      actorType: actor,
      range,
    },
    totals: {
      rows: rows.length,
      bySource,
      byActorType: byActor,
      incidents,
    },
  };

  return <AuditClient data={data} />;
}
