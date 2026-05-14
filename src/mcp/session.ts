/**
 * Per-process session state for the MCP server. A "session" is the span
 * of a single IDE/agent conversation. It carries a serverId returned by
 * `POST /api/v1/mcp/sessions` so subsequent telemetry (tool calls,
 * usage events) can be attributed to it in `audit_logs`.
 *
 * Borrowed shape from `@ai-sdlc/mcp-advisor` (session-start / session-end /
 * track-usage). Differences: coznt's sessions are persisted to the
 * platform's audit log, not a local file.
 */

import { randomUUID } from "node:crypto";

export interface SessionInfo {
  localId: string;
  serverId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  /** Best-effort label for what the agent said it was doing. */
  intent: string | null;
  toolCalls: number;
}

let current: SessionInfo | null = null;

export function startLocalSession(intent: string | null): SessionInfo {
  current = {
    localId: randomUUID(),
    serverId: null,
    startedAt: new Date(),
    endedAt: null,
    intent,
    toolCalls: 0,
  };
  return current;
}

export function attachServerId(serverId: string): void {
  if (current) current.serverId = serverId;
}

export function endLocalSession(): SessionInfo | null {
  if (!current) return null;
  current.endedAt = new Date();
  const ended = current;
  current = null;
  return ended;
}

export function getCurrentSession(): SessionInfo | null {
  return current;
}

export function bumpToolCall(): void {
  if (current) current.toolCalls += 1;
}
