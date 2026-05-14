/**
 * MCP resource: coznt://history
 *
 * Recent audit-log entries for the project, so the agent can quickly
 * scan "what happened here in the last week" without paging through a
 * UI. Last 7 days, capped at 50 rows.
 *
 * Borrowed shape from `@ai-sdlc/mcp-advisor`'s `history` resource.
 */

import { CozntClient } from "../client.js";

interface HistoryResponse {
  rows: Array<{
    id: string;
    occurredAtIso?: string;
    actorType: string;
    actorName: string | null;
    action: string;
    entityType: string;
    summary: string | null;
    signature?: string;
  }>;
}

export async function readHistory(client: CozntClient) {
  // The /audit page exposes its data via the page itself; for the MCP
  // resource we hit the unified audit query endpoint that already exists.
  // Falls back to an empty array if the org has no events yet.
  let data: HistoryResponse = { rows: [] };
  try {
    data = await client.get<HistoryResponse>("/api/v1/mcp/history?range=7d&limit=50");
  } catch {
    data = { rows: [] };
  }
  return {
    contents: [
      {
        uri: "coznt://history",
        mimeType: "application/json",
        text: JSON.stringify(
          {
            schema: "https://coznt.io/schemas/history.v1",
            rangeDays: 7,
            events: data.rows.map((r) => ({
              at: r.occurredAtIso,
              actor: { type: r.actorType, name: r.actorName },
              action: r.action,
              entityType: r.entityType,
              summary: r.summary,
              signature: r.signature ?? null,
            })),
          },
          null,
          2,
        ),
      },
    ],
  };
}
