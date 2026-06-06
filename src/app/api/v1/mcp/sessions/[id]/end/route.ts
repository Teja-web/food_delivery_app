/**
 * POST /api/v1/mcp/sessions/[id]/end — close an MCP session.
 *
 * Records the session's outcome, duration, and tool-call count to the
 * audit log. Idempotent — repeated calls are no-ops on the client side
 * since the local session is cleared after first call.
 *
 * Also computes a per-session prompt-quality summary (mean score, tier
 * histogram) from prompts captured during the session and stuffs it in
 * `audit_log.after.promptQuality`. Skipped when the governance flag
 * is off or no prompts were captured.
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { auditLogs } from "@/db/schema/audit/audit-log";
import { promptLogs } from "@/db/schema/prompt-log";
import { handleApi } from "@/lib/auth/api-key";
import { isPromptGovernanceEnabled } from "@/domain/prompt-quality/feature-flag";

interface Body {
  outcome?: "completed" | "abandoned";
  summary?: string | null;
  toolCalls?: number;
  durationMs?: number;
}

interface PromptQualitySummary {
  total: number;
  meanScore: number;
  tiers: { good: number; needsImprovement: number; poor: number };
}

async function summarizePromptQuality(
  organizationId: string,
  mcpSessionId: string,
): Promise<PromptQualitySummary | null> {
  if (!isPromptGovernanceEnabled()) return null;
  const rows = await db
    .select({
      promptScore: promptLogs.promptScore,
      promptTier: promptLogs.promptTier,
    })
    .from(promptLogs)
    .where(
      and(
        eq(promptLogs.organizationId, organizationId),
        eq(promptLogs.mcpSessionId, mcpSessionId),
      ),
    );
  if (rows.length === 0) return null;

  let scoreSum = 0;
  let scored = 0;
  let good = 0;
  let needsImprovement = 0;
  let poor = 0;
  for (const r of rows) {
    if (typeof r.promptScore === "number") {
      scoreSum += r.promptScore;
      scored += 1;
    }
    if (r.promptTier === "GOOD") good += 1;
    else if (r.promptTier === "NEEDS_IMPROVEMENT") needsImprovement += 1;
    else if (r.promptTier === "POOR") poor += 1;
  }
  return {
    total: rows.length,
    meanScore: scored === 0 ? 0 : Math.round(scoreSum / scored),
    tiers: { good, needsImprovement, poor },
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleApi(req, async (ctx) => {
    const body = (await req.json().catch(() => ({}))) as Body;
    const outcome = body.outcome ?? "completed";
    const toolCalls = body.toolCalls ?? 0;
    const durationMs = body.durationMs ?? 0;

    // Best-effort prompt summary — never fail the session-end on a summary glitch.
    const promptQuality = await summarizePromptQuality(ctx.organizationId, id).catch(() => null);

    await db.insert(auditLogs).values({
      organizationId: ctx.organizationId,
      actorType: "api",
      actorId: ctx.apiKeyId,
      actorName: "mcp-session",
      action: "mcp.session_end",
      entityType: "mcp_session",
      entityId: id,
      invokedVia: "mcp:close",
      summary:
        `MCP session ended (${outcome}, ${toolCalls} tool calls, ${Math.round(durationMs / 1000)}s)` +
        (body.summary ? `: ${body.summary}` : "") +
        (promptQuality ? ` · ${promptQuality.total} prompts, mean ${promptQuality.meanScore}` : ""),
      after: {
        outcome,
        toolCalls,
        durationMs,
        summary: body.summary ?? null,
        promptQuality,
      } as Record<string, unknown>,
    });
    return { id, ended: true, promptQuality };
  });
}
