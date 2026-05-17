/**
 * MCP daemon health snapshot — surfaces evidence that the MCP server is
 * actually being called by agents in the field. Used by the
 * `/integrations` "MCP daemon" card so an operator can answer
 * "is the daemon working?" without grepping logs.
 *
 * Reads from `audit_logs` (where MCP sessions start) and `api_keys`
 * (where bearer tokens record their last use). No new schema.
 */

import { and, desc, eq, gte, isNotNull } from "drizzle-orm";

import { db } from "@/db/client";
import { apiKeys } from "@/db/schema/api-key";
import { auditLogs } from "@/db/schema/audit-log";

export interface McpDaemonStatus {
  /** Most recent `mcp.session_start` row across the org, if any. */
  lastSession: {
    id: string;
    startedAt: Date;
    intent: string | null;
    actorId: string | null;
  } | null;
  /** Distinct API keys that hit `/api/v1` in the trailing 7 days. */
  activeKeysLast7d: number;
  /** Distinct API keys that hit `/api/v1` ever (i.e. lastUsedAt is set). */
  everUsedKeys: number;
  /** Total non-revoked API keys for the org. */
  activeKeysTotal: number;
  /** Most recent any-key usage timestamp. */
  lastKeyUseAt: Date | null;
}

export async function getMcpDaemonStatus(organizationId: string): Promise<McpDaemonStatus> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [lastSessionRow] = await db
    .select({
      id: auditLogs.entityId,
      startedAt: auditLogs.createdAt,
      summary: auditLogs.summary,
      actorId: auditLogs.actorId,
      after: auditLogs.after,
    })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.organizationId, organizationId),
        eq(auditLogs.action, "mcp.session_start"),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(1);

  const keyRows = await db
    .select({ id: apiKeys.id, lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt })
    .from(apiKeys)
    .where(eq(apiKeys.organizationId, organizationId));

  let active = 0;
  let everUsed = 0;
  let activeLast7d = 0;
  let lastKeyUseAt: Date | null = null;
  for (const k of keyRows) {
    if (!k.revokedAt) active++;
    if (k.lastUsedAt) {
      everUsed++;
      if (k.lastUsedAt >= sevenDaysAgo) activeLast7d++;
      if (!lastKeyUseAt || k.lastUsedAt > lastKeyUseAt) lastKeyUseAt = k.lastUsedAt;
    }
  }

  let lastSession: McpDaemonStatus["lastSession"] = null;
  if (lastSessionRow && lastSessionRow.id) {
    const after = (lastSessionRow.after as Record<string, unknown> | null) ?? null;
    const intent = typeof after?.intent === "string" ? after.intent : null;
    lastSession = {
      id: lastSessionRow.id,
      startedAt: lastSessionRow.startedAt,
      intent,
      actorId: lastSessionRow.actorId,
    };
  }

  return {
    lastSession,
    activeKeysLast7d: activeLast7d,
    everUsedKeys: everUsed,
    activeKeysTotal: active,
    lastKeyUseAt,
  };
}
