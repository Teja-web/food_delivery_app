/**
 * MCP tool: flush_local_prompts
 *
 * Drain `.coznt/prompt-buffer.jsonl` to the platform. Atomic-on-success —
 * the buffer is rewritten with only the entries that failed to insert.
 */

import { z } from "zod";

import { CozntClient } from "../../client.js";
import { bumpToolCall, getSessionProject } from "../../session.js";
import { readLocalBuffer, writeLocalBuffer } from "../../lib/prompt-buffer.js";

export const flushLocalPromptsInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
  workspaceDir: z.string().optional().describe("Workspace directory. Defaults to CWD."),
});

export type FlushLocalPromptsInput = z.infer<typeof flushLocalPromptsInput>;

export async function runFlushLocalPrompts(client: CozntClient, input: FlushLocalPromptsInput) {
  bumpToolCall();
  const workspaceDir = input.workspaceDir ?? process.cwd();
  const fallbackProjectId = getSessionProject()?.id ?? null;
  const entries = await readLocalBuffer(workspaceDir);

  if (entries.length === 0) {
    return { flushed: 0, errors: [] as Array<{ localId: string; reason: string }> };
  }

  const remaining: typeof entries = [];
  const errors: Array<{ localId: string; reason: string }> = [];
  let flushed = 0;

  for (const entry of entries) {
    const projectId = entry.projectId ?? input.projectId ?? fallbackProjectId;
    try {
      await client.post<unknown>("/api/v1/mcp/prompts", {
        projectId,
        mcpSessionId: entry.mcpSessionId,
        role: entry.role,
        source: entry.source,
        content: entry.content,
        phase: entry.phase,
        authorName: entry.authorName,
        authorUsername: entry.authorUsername,
        authorEmail: entry.authorEmail,
        clientLocalId: entry.localId,
        prescored: entry.prescored,
      });
      flushed++;
    } catch (err) {
      remaining.push(entry);
      errors.push({ localId: entry.localId, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  // Rewrite buffer with only the failures.
  await writeLocalBuffer(workspaceDir, remaining);
  return { flushed, errors };
}
