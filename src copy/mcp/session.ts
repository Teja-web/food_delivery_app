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

export interface SessionProject {
  id: string;
  name: string;
  slug: string;
}

export interface RequirementDraft {
  id: string;
  kind?: string;
  title: string;
  summary?: string;
  body?: string;
  priority?: string;
  effortEstimate?: string;
  parentPlanId?: string | null;
  assigneeId?: string;
  assigneeName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionInfo {
  localId: string;
  serverId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  /** Best-effort label for what the agent said it was doing. */
  intent: string | null;
  toolCalls: number;
  /**
   * Project bound to this session — populated lazily on the first tool
   * call by resolving the API key's pinned project via `/api/v1/mcp/me`.
   * Mirrors what the platform knows; routes still re-validate org match
   * and refresh phase, so a slightly-stale cache here is fine.
   */
  project: SessionProject | null;
  /**
   * In-flight requirement drafts. Per-process, ephemeral by design —
   * the agent's local working set. Pushed to the platform via
   * `push_requirements`; cleared on successful push.
   */
  drafts: RequirementDraft[];
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
    project: null,
    drafts: [],
  };
  return current;
}

/**
 * Bind a project to the session. Lazily creates a session if none is
 * active so the server's auto-bind path (`/api/v1/mcp/me` on first tool
 * call) doesn't need to mandate `session_start` first.
 */
export function setSessionProject(project: SessionProject): void {
  if (!current) startLocalSession(null);
  current!.project = project;
}

export function getSessionProject(): SessionProject | null {
  return current?.project ?? null;
}

/** Lazily create the session so draft_* verbs can be the first call. */
function ensureSession(): SessionInfo {
  if (!current) startLocalSession(null);
  return current!;
}

export function listDrafts(): RequirementDraft[] {
  return current?.drafts ?? [];
}

export function addDraft(
  input: Omit<RequirementDraft, "id" | "createdAt" | "updatedAt">,
): RequirementDraft {
  const s = ensureSession();
  const now = new Date();
  const draft: RequirementDraft = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    ...input,
  };
  s.drafts.push(draft);
  return draft;
}

export function updateDraft(
  id: string,
  patch: Partial<Omit<RequirementDraft, "id" | "createdAt">>,
): RequirementDraft | null {
  if (!current) return null;
  const idx = current.drafts.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  current.drafts[idx] = { ...current.drafts[idx], ...patch, updatedAt: new Date() };
  return current.drafts[idx];
}

export function deleteDraft(id: string): boolean {
  if (!current) return false;
  const idx = current.drafts.findIndex((d) => d.id === id);
  if (idx === -1) return false;
  current.drafts.splice(idx, 1);
  return true;
}

export function clearDrafts(): void {
  if (current) current.drafts = [];
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
