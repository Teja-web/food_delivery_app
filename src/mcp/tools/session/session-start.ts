/**
 * MCP tool: session_start
 *
 * Opens a session record on coznt's side and starts local tracking. The
 * returned serverId is correlated with every subsequent tool call in
 * this process so the audit log can replay what the agent did.
 *
 * Borrowed from `@ai-sdlc/mcp-advisor`'s session-start. Coznt persists
 * sessions to `audit_logs` (not a local file).
 */

import { z } from "zod";

import { CozntClient } from "../../client";
import { attachServerId, startLocalSession } from "../../session";

export const sessionStartInput = z.object({
  intent: z
    .string()
    .optional()
    .describe(
      "What the agent is about to do (\"reviewing PR #42\", \"drafting ADR for X\"). Helps a human auditor scan the audit log later.",
    ),
  repoUrl: z.string().optional().describe("Optional repo hint for project resolution."),
});

export type SessionStartInput = z.infer<typeof sessionStartInput>;

export async function runSessionStart(client: CozntClient, input: SessionStartInput) {
  const local = startLocalSession(input.intent ?? null);
  const res = await client.post<{ id: string; createdAt: string }>("/api/v1/mcp/sessions", {
    intent: input.intent ?? null,
    repoUrl: input.repoUrl ?? null,
    localId: local.localId,
  });
  attachServerId(res.id);
  return { sessionId: res.id, startedAt: res.createdAt };
}
