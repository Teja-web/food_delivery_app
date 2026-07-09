/**
 * GET /api/v1/mcp/history — recent audit-log entries for this org/project.
 *
 * Backs the `coznt://history` MCP resource. Same data model as the
 * /audit page, just JSON-shaped and capped for an agent's context window.
 */

import { handleApi } from "@/lib/auth/api-key";
import { queryAuditLog } from "@/operations/audit/audit";

const RANGE_MS: Record<string, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};

export async function GET(req: Request) {
  return handleApi(req, async () => {
    const url = new URL(req.url);
    const range = url.searchParams.get("range") ?? "7d";
    const ms = RANGE_MS[range] ?? RANGE_MS["7d"];
    const limit = Math.min(200, Number(url.searchParams.get("limit") ?? "50"));
    const to = new Date();
    const from = new Date(Date.now() - ms);

    const rows = await queryAuditLog({ scope: "all", from, to, limit });
    return {
      rangeDays: ms / 86_400_000,
      rows: rows.map((r) => ({
        id: r.id,
        occurredAtIso: r.occurredAt.toISOString(),
        actorType: r.actorType,
        actorName: r.actorName,
        action: r.action,
        entityType: r.entityType,
        summary: r.summary,
        signature: r.signature,
      })),
    };
  });
}
