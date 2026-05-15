/**
 * POST /api/v1/mcp/sessions/[id]/end — close an MCP session.
 *
 * Records the session's outcome, duration, and tool-call count to the
 * audit log. Idempotent — repeated calls are no-ops on the client side
 * since the local session is cleared after first call.
 */

import { db } from "@/db/client";
import { auditLogs } from "@/db/schema/audit-log";
import { handleApi } from "@/lib/auth/api-key";

interface Body {
  outcome?: "completed" | "abandoned";
  summary?: string | null;
  toolCalls?: number;
  durationMs?: number;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleApi(req, async (ctx) => {
    const body = (await req.json().catch(() => ({}))) as Body;
    const outcome = body.outcome ?? "completed";
    const toolCalls = body.toolCalls ?? 0;
    const durationMs = body.durationMs ?? 0;
    await db.insert(auditLogs).values({
      organizationId: ctx.organizationId,
      actorType: "api",
      actorId: ctx.apiKeyId,
      actorName: "mcp-session",
      action: "mcp.session_end",
      entityType: "mcp_session",
      entityId: id,
      summary: `MCP session ended (${outcome}, ${toolCalls} tool calls, ${Math.round(durationMs / 1000)}s)${body.summary ? `: ${body.summary}` : ""}`,
      after: { outcome, toolCalls, durationMs, summary: body.summary ?? null } as Record<
        string,
        unknown
      >,
    });
    return { id, ended: true };
  });
}
