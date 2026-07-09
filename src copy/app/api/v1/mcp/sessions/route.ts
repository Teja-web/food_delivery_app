/**
 * POST /api/v1/mcp/sessions — open an MCP session.
 *
 * Writes an `audit_log` row marking the session start. Returns a server
 * id the MCP client correlates with every subsequent tool call (so the
 * audit trail can replay the agent's span).
 */

import { nanoid } from "nanoid";

import { db } from "@/db/client";
import { auditLogs } from "@/db/schema/audit/audit-log";
import { handleApi } from "@/lib/auth/api-key";

interface Body {
  intent?: string | null;
  repoUrl?: string | null;
  localId?: string | null;
  /**
   * Editor declared at handshake — used as the default `source` for
   * `prompt_logs` rows in this session. Persisted in audit_log.after
   * (sessions live in audit_logs; no standalone table).
   */
  vibeSource?: "CURSOR" | "CLAUDE_CODE" | "COPILOT" | "WINDSURF" | "CODEX" | "OTHER" | null;
}

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const body = (await req.json().catch(() => ({}))) as Body;
    const sessionId = nanoid();
    const intent = body.intent?.trim() || "unspecified";

    await db.insert(auditLogs).values({
      organizationId: ctx.organizationId,
      actorType: "api",
      actorId: ctx.apiKeyId,
      actorName: "mcp-session",
      action: "mcp.session_start",
      entityType: "mcp_session",
      entityId: sessionId,
      summary: `MCP session started: ${intent}`,
      invokedVia: "mcp:handshake",
      after: {
        intent,
        repoUrl: body.repoUrl ?? null,
        localId: body.localId ?? null,
        vibeSource: body.vibeSource ?? null,
      } as Record<string, unknown>,
    });
    return {
      id: sessionId,
      createdAt: new Date().toISOString(),
      vibeSource: body.vibeSource ?? null,
    };
  });
}
