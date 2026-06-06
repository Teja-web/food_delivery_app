/**
 * POST /api/v1/mcp/score-prompt — score a prompt without persisting.
 *
 * Backs the `rate_prompt` MCP verb. Accepts either `content` (inline) or
 * `promptLogId` (re-score an existing row against the current rubric).
 */

import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { promptLogs } from "@/db/schema/prompt-log";
import { handleApi } from "@/lib/auth/api-key";
import { scorePromptQuality } from "@/domain/prompt-quality/rubric";
import { isPromptGovernanceEnabled } from "@/domain/prompt-quality/feature-flag";

const bodySchema = z
  .object({
    content: z.string().min(1).optional(),
    promptLogId: z.string().optional(),
    projectId: z.string().optional(),
  })
  .refine((d) => Boolean(d.content) !== Boolean(d.promptLogId), {
    message: "Provide exactly one of `content` or `promptLogId`",
  });

export async function POST(req: Request) {
  if (!isPromptGovernanceEnabled()) {
    return Response.json(
      { error: "Prompt governance is not enabled on this deployment" },
      { status: 503 },
    );
  }
  return handleApi(req, async (ctx) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const err = new Error("Invalid body") as Error & { status?: number; details?: unknown };
      err.status = 400;
      err.details = parsed.error.issues;
      throw err;
    }

    let content = parsed.data.content ?? "";

    if (parsed.data.promptLogId) {
      const row = await db.query.promptLogs.findFirst({
        where: and(
          eq(promptLogs.id, parsed.data.promptLogId),
          eq(promptLogs.organizationId, ctx.organizationId),
        ),
      });
      if (!row) {
        const err = new Error("promptLog not found") as Error & { status?: number };
        err.status = 404;
        throw err;
      }
      content = row.content;
    }

    return scorePromptQuality({ content, phase: null });
  });
}
