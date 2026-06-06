/**
 * MCP tool: search_audit
 *
 * Keyword search over audit_logs.summary + action. CISO-style queries
 * like "show me everything around the v2.3 incident" — ranked by recency
 * inside the matching set.
 */

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall } from "../../session";

const ACTOR_TYPES = ["user", "api", "system", "agent"] as const;

export const searchAuditInput = z.object({
  query: z.string().min(1),
  actorType: z.enum(ACTOR_TYPES).optional(),
  fromIso: z.string().optional(),
  toIso: z.string().optional(),
  limit: z.number().int().min(1).max(500).optional().describe("Default 50, max 500."),
});

export type SearchAuditInput = z.infer<typeof searchAuditInput>;

export async function runSearchAudit(client: CozntClient, input: SearchAuditInput) {
  bumpToolCall();
  return client.post<unknown>(`/api/v1/mcp/search/audit`, {
    query: input.query,
    actorType: input.actorType,
    fromIso: input.fromIso,
    toIso: input.toIso,
    limit: input.limit,
  });
}
