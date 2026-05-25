/**
 * POST /api/v1/mcp/prompts — persist an agent-loop prompt.
 *
 * Backs the `log_prompt` MCP verb and the Claude Code UserPromptSubmit hook.
 * Idempotent on `(projectId, clientLocalId)`. Sub-GOOD scored prompts emit
 * a `prompt_quality_signal` row into the autonomy ledger via the canonical
 * skill-autonomy.ts writer.
 *
 * Disabled when COZNT_PROMPT_GOVERNANCE_ENABLED is unset/false.
 */

import { z } from "zod/v4";

import { handleApi } from "@/lib/auth/api-key";
import { capturePrompt } from "@/operations/prompt-log";
import {
  PROMPT_ROLES,
  VIBE_CODING_TOOLS,
  PROMPT_QUALITY_TIERS,
} from "@/db/schema/prompt-log";
import { isPromptGovernanceEnabled } from "@/lib/prompt-quality/feature-flag";

const bodySchema = z.object({
  projectId: z.string().nullable().optional(),
  mcpSessionId: z.string().nullable().optional(),
  role: z.enum(PROMPT_ROLES).optional(),
  source: z.enum(VIBE_CODING_TOOLS).optional(),
  content: z.string().min(1),
  phase: z.string().nullable().optional(),
  authorName: z.string().nullable().optional(),
  authorUsername: z.string().nullable().optional(),
  authorEmail: z.string().nullable().optional(),
  clientLocalId: z.string().nullable().optional(),
  /** Optional pre-scored fields from the hook (port of rubric). */
  prescored: z
    .object({
      overallScore: z.number().int().min(0).max(100),
      tier: z.enum(PROMPT_QUALITY_TIERS),
      dimensions: z.object({
        clarity: z.number(),
        context: z.number(),
        specificity: z.number(),
        constraints: z.number(),
        phaseFit: z.number(),
        safety: z.number(),
      }),
      suggestions: z.array(z.string()),
      flags: z.array(z.string()),
      rubricVersion: z.string(),
    })
    .nullable()
    .optional(),
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
    const input = parsed.data;

    // Scope check: API key may be project-pinned. If so, enforce it.
    const projectId = input.projectId ?? ctx.projectId ?? null;
    if (ctx.projectId && projectId && projectId !== ctx.projectId) {
      const err = new Error("Project outside this API key's scope") as Error & { status?: number };
      err.status = 403;
      throw err;
    }

    const { row, created, score } = await capturePrompt({
      organizationId: ctx.organizationId,
      projectId,
      mcpSessionId: input.mcpSessionId ?? null,
      role: input.role,
      source: input.source,
      content: input.content,
      phase: input.phase ?? null,
      authorName: input.authorName ?? null,
      authorUsername: input.authorUsername ?? null,
      authorEmail: input.authorEmail ?? null,
      clientLocalId: input.clientLocalId ?? null,
      prescored: input.prescored ?? null,
    });

    return {
      id: row.id,
      created,
      score: {
        overallScore: score.overallScore,
        tier: score.tier,
        dimensions: score.dimensions,
        suggestions: score.suggestions,
        flags: score.flags,
        rubricVersion: score.rubricVersion,
      },
    };
  });
}
