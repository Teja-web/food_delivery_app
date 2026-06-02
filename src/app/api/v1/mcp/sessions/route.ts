/**
 * POST /api/v1/mcp/sessions — open an MCP session.
 *
 * Writes an `audit_log` row marking the session start. Returns a server
 * id the MCP client correlates with every subsequent tool call (so the
 * audit trail can replay the agent's span).
 *
 * When the client declares a `repoUrl`, the per-repo trust policy is
 * resolved (auto-creating a default `read-write` row on first touch).
 * If the policy is `deny`, the session is rejected with `repo_denied`.
 */

import { nanoid } from "nanoid";

import { db } from "@/db/client";
import { auditLogs } from "@/db/schema/audit/audit-log";
import { handleApi } from "@/lib/auth/api-key";
import { enforceSessionBind, RepoDeniedError } from "@/lib/auth/repo-policy";

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

    // Resolve repo policy when the client declared a remote. Auto-creates
    // a `read-write` row on first touch (visible in audit log).
    let repoPolicy: { remoteCanonical: string; policy: string } | null = null;
    if (body.repoUrl) {
      try {
        const res = await enforceSessionBind(ctx.organizationId, body.repoUrl, {
          actorId: ctx.apiKeyId,
          actorName: "mcp-session-start",
        });
        repoPolicy = { remoteCanonical: res.remoteCanonical, policy: res.policy };
      } catch (e) {
        if (e instanceof RepoDeniedError) {
          // Rejected — log the denial and bubble.
          await db.insert(auditLogs).values({
            organizationId: ctx.organizationId,
            actorType: "api",
            actorId: ctx.apiKeyId,
            actorName: "mcp-session",
            action: "mcp.session_denied",
            entityType: "mcp_session",
            entityId: sessionId,
            summary: `MCP session denied by repo policy: ${body.repoUrl}`,
            after: { intent, repoUrl: body.repoUrl } as Record<string, unknown>,
          });
        }
        throw e;
      }
    }

    await db.insert(auditLogs).values({
      organizationId: ctx.organizationId,
      actorType: "api",
      actorId: ctx.apiKeyId,
      actorName: "mcp-session",
      action: "mcp.session_start",
      entityType: "mcp_session",
      entityId: sessionId,
      summary: `MCP session started: ${intent}`,
      after: {
        intent,
        repoUrl: body.repoUrl ?? null,
        localId: body.localId ?? null,
        repoPolicy,
        vibeSource: body.vibeSource ?? null,
      } as Record<string, unknown>,
    });
    return {
      id: sessionId,
      createdAt: new Date().toISOString(),
      repoPolicy,
      vibeSource: body.vibeSource ?? null,
    };
  });
}
