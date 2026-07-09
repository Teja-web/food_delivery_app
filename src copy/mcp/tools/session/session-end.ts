/**
 * MCP tool: session_end
 *
 * Closes the active session. Sends summary telemetry (tool call count,
 * duration) so the audit log can show the full span.
 */

import { z } from "zod";

import { CozntClient } from "../../client";
import { endLocalSession, getCurrentSession } from "../../session";

export const sessionEndInput = z.object({
  outcome: z
    .enum(["completed", "abandoned"])
    .default("completed")
    .describe("Did the session reach a coherent endpoint, or was it abandoned?"),
  summary: z.string().optional().describe("1-2 sentence wrap-up the agent wants to record."),
});

export type SessionEndInput = z.infer<typeof sessionEndInput>;

export async function runSessionEnd(client: CozntClient, input: SessionEndInput) {
  const session = getCurrentSession();
  if (!session?.serverId) {
    return { ended: false, reason: "no_active_session" };
  }
  const ended = endLocalSession();
  await client.post<unknown>(`/api/v1/mcp/sessions/${encodeURIComponent(session.serverId)}/end`, {
    outcome: input.outcome,
    summary: input.summary ?? null,
    toolCalls: ended?.toolCalls ?? 0,
    durationMs: ended ? ended.endedAt!.getTime() - ended.startedAt.getTime() : 0,
  });
  return { ended: true, sessionId: session.serverId };
}
