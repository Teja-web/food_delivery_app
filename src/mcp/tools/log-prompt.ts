/**
 * MCP tool: log_prompt
 *
 * Persist a USER / ASSISTANT / SYSTEM message to the agent-loop ledger.
 * Closes the gap on agent-loop observability — `invoke_skill` only sees
 * server-side governed calls; this verb captures the prompt that drove
 * the host LLM in the first place.
 *
 * Behaviour:
 *   1. Resolve author + session id locally (cheap, no platform call).
 *   2. POST to `/api/v1/mcp/prompts`.
 *   3. On network failure: append to `.coznt/prompt-buffer.jsonl` and
 *      return a buffered-ack so the agent isn't blocked.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";

import { CozntClient } from "../client.js";
import { bumpToolCall, getCurrentSession, getSessionProject } from "../session.js";
import { appendToLocalBuffer } from "../lib/prompt-buffer.js";
import { resolveVibeAuthor } from "../lib/resolve-vibe-author.js";

export const logPromptInput = z.object({
  content: z.string().min(1).describe("Prompt text. USER messages typed by the developer."),
  role: z.enum(["USER", "ASSISTANT", "SYSTEM"]).default("USER"),
  source: z
    .enum(["CURSOR", "CLAUDE_CODE", "COPILOT", "WINDSURF", "CODEX", "OTHER"])
    .default("CURSOR"),
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
  mcpSessionId: z.string().optional().describe("Defaults to the active MCP session id."),
  authorName: z.string().optional(),
  authorUsername: z.string().optional(),
  authorEmail: z.string().optional(),
  clientLocalId: z
    .string()
    .optional()
    .describe(
      "Idempotency key. The platform de-dupes on (projectId, clientLocalId); reuse a key to upsert.",
    ),
  alsoBufferLocally: z.boolean().default(false).describe("Also append to the local JSONL buffer."),
});

export type LogPromptInput = z.infer<typeof logPromptInput>;

export async function runLogPrompt(client: CozntClient, input: LogPromptInput) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id ?? null;
  const mcpSessionId = input.mcpSessionId ?? getCurrentSession()?.serverId ?? null;
  const workspaceDir = process.cwd();

  // Resolve author when caller didn't pass any.
  let author = {
    authorName: input.authorName ?? null,
    authorEmail: input.authorEmail ?? null,
    authorUsername: input.authorUsername ?? null,
  };
  if (!author.authorName) {
    const resolved = await resolveVibeAuthor(workspaceDir);
    author = {
      authorName: input.authorName ?? resolved.authorName,
      authorEmail: input.authorEmail ?? resolved.authorEmail,
      authorUsername: input.authorUsername ?? resolved.authorUsername,
    };
  }

  const clientLocalId = input.clientLocalId ?? randomUUID();
  const payload = {
    projectId,
    mcpSessionId,
    role: input.role,
    source: input.source,
    content: input.content,
    authorName: author.authorName,
    authorUsername: author.authorUsername,
    authorEmail: author.authorEmail,
    clientLocalId,
  };

  try {
    const res = await client.post<{
      id: string;
      created: boolean;
      score: { overallScore: number; tier: string };
    }>("/api/v1/mcp/prompts", payload);
    if (input.alsoBufferLocally) {
      await appendToLocalBuffer(workspaceDir, {
        ...payload,
        phase: null,
        prescored: null,
        localId: clientLocalId,
      }).catch(() => undefined);
    }
    return { ...res, buffered: false };
  } catch (err) {
    // Network / 5xx failure → buffer locally and return ack.
    const buffered = await appendToLocalBuffer(workspaceDir, {
      ...payload,
      phase: null,
      prescored: null,
      localId: clientLocalId,
    });
    return {
      id: null,
      created: false,
      buffered: true,
      localId: buffered.localId,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
