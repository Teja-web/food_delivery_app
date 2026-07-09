/**
 * Prompt log operations — agent-loop observability layer.
 *
 * The autonomy ledger reads `attenuationFactorForProject()` during the
 * promotion gate. Sustained low-tier prompts slow promotion (raise the
 * required sample count) but never trigger demotion — demotion stays
 * outcome-anchored.
 */

import { z } from "zod/v4";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import {
  promptLogs,
  PROMPT_ROLES,
  VIBE_CODING_TOOLS,
  PROMPT_QUALITY_TIERS,
} from "@/db/schema/prompt-log";
import { projects } from "@/db/schema/project";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { recordPromptQualitySignal } from "@/operations/skill/skill-autonomy";
import {
  scorePromptQuality,
  RUBRIC_VERSION,
  type PromptScore,
} from "@/domain/prompt-quality/rubric";

const promptLogSchema = z.object({
  projectId: z.string().nullable().optional(),
  mcpSessionId: z.string().nullable().optional(),
  role: z.enum(PROMPT_ROLES).default("USER"),
  source: z.enum(VIBE_CODING_TOOLS).default("OTHER"),
  content: z.string().min(1),
  authorName: z.string().nullable().optional(),
  authorUsername: z.string().nullable().optional(),
  authorEmail: z.string().nullable().optional(),
  clientLocalId: z.string().nullable().optional(),
  promptScore: z.number().int().min(0).max(100).nullable().optional(),
  promptTier: z.enum(PROMPT_QUALITY_TIERS).nullable().optional(),
  promptScoreDetail: z.record(z.string(), z.unknown()).nullable().optional(),
  rubricVersion: z.string().nullable().optional(),
  scoredAt: z.date().nullable().optional(),
});

export const promptLogCrud = createEntityCrud({
  db,
  table: promptLogs,
  queryKey: "prompt_logs",
  idField: "id",
  schema: promptLogSchema,
  searchFields: ["content"],
  onMutate: () => safeRevalidate("/projects"),
});

interface CapturePromptInput {
  organizationId: string;
  projectId: string | null;
  mcpSessionId?: string | null;
  role?: "USER" | "ASSISTANT" | "SYSTEM";
  source?: (typeof VIBE_CODING_TOOLS)[number];
  content: string;
  authorName?: string | null;
  authorUsername?: string | null;
  authorEmail?: string | null;
  clientLocalId?: string | null;
  /**
   * Pre-scored fields from the hook. When present, the server trusts them
   * if `rubricVersion` matches the current server version; otherwise it
   * rescores.
   */
  prescored?: PromptScore | null;
}

/**
 * Persist a prompt log row with idempotency on (projectId, clientLocalId).
 * Returns the row plus a flag indicating whether a new row was created
 * (false = idempotent hit, existing row returned).
 */
export async function capturePrompt(input: CapturePromptInput) {
  void projects;
  // Score now if the client didn't, or if rubric version drifted.
  const score: PromptScore =
    input.prescored && input.prescored.rubricVersion === RUBRIC_VERSION
      ? input.prescored
      : scorePromptQuality({ content: input.content, phase: null as never });

  const values = {
    organizationId: input.organizationId,
    projectId: input.projectId,
    mcpSessionId: input.mcpSessionId ?? null,
    role: input.role ?? "USER",
    source: input.source ?? "OTHER",
    content: input.content,
    authorName: input.authorName ?? null,
    authorUsername: input.authorUsername ?? null,
    authorEmail: input.authorEmail ?? null,
    clientLocalId: input.clientLocalId ?? null,
    promptScore: score.overallScore,
    promptTier: score.tier,
    promptScoreDetail: {
      dimensions: score.dimensions,
      suggestions: score.suggestions,
      flags: score.flags,
    } as Record<string, unknown>,
    rubricVersion: score.rubricVersion,
    scoredAt: new Date(),
  };

  // Idempotent insert keyed on (projectId, clientLocalId) — both must be
  // non-null for the unique index to engage.
  if (input.clientLocalId && input.projectId) {
    const existing = await db.query.promptLogs.findFirst({
      where: and(
        eq(promptLogs.projectId, input.projectId),
        eq(promptLogs.clientLocalId, input.clientLocalId),
      ),
    });
    if (existing) return { row: existing, created: false, score };
  }

  const [row] = await db.insert(promptLogs).values(values).returning();

  // Sub-GOOD prompts emit a project-level signal row for the autonomy ledger.
  // Routed through skill-autonomy.ts (the canonical skill_outcomes writer).
  if ((score.tier === "NEEDS_IMPROVEMENT" || score.tier === "POOR") && input.projectId) {
    await recordPromptQualitySignal({
      organizationId: input.organizationId,
      projectId: input.projectId,
      promptLogId: row.id,
      score: score.overallScore,
      tier: score.tier,
    });
  }

  return { row, created: true, score };
}

interface TierDistribution {
  good: number;
  needsImprovement: number;
  poor: number;
  total: number;
}

/**
 * Per-tier prompt distribution for a project over the trailing window.
 */
export async function getPromptDistribution(
  organizationId: string,
  projectId: string,
  windowDays = 30,
): Promise<TierDistribution> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ tier: promptLogs.promptTier })
    .from(promptLogs)
    .where(
      and(
        eq(promptLogs.organizationId, organizationId),
        eq(promptLogs.projectId, projectId),
        gte(promptLogs.createdAt, since),
      ),
    );
  let good = 0;
  let needsImprovement = 0;
  let poor = 0;
  for (const r of rows) {
    if (r.tier === "GOOD") good++;
    else if (r.tier === "NEEDS_IMPROVEMENT") needsImprovement++;
    else if (r.tier === "POOR") poor++;
  }
  return { good, needsImprovement, poor, total: rows.length };
}

/**
 * Compute the promotion-attenuation factor for a project.
 *
 * Returns a multiplier on the required-outcome-count for the next autonomy
 * level. 1.0 = no attenuation. ≥1.5 = sustained low-quality prompts are
 * holding promotion back.
 *
 * Window: 30d. Minimum sample: 5 prompts (below this, return 1.0 —
 * not enough signal to attenuate).
 */
export async function attenuationFactorForProject(
  organizationId: string,
  projectId: string,
  windowDays = 30,
): Promise<{ factor: number; distribution: TierDistribution }> {
  const distribution = await getPromptDistribution(organizationId, projectId, windowDays);
  if (distribution.total < 5) return { factor: 1.0, distribution };

  const goodRatio = distribution.good / distribution.total;
  const poorRatio = distribution.poor / distribution.total;

  // Spec: ≥80% GOOD → 1.0 (no attenuation).
  if (goodRatio >= 0.8) return { factor: 1.0, distribution };

  // Spec: ≥40% POOR → ≥1.5.
  if (poorRatio >= 0.4) {
    const factor = 1.5 + Math.min(1.0, (poorRatio - 0.4) * 1.5); // up to 2.5
    return { factor: Math.round(factor * 100) / 100, distribution };
  }

  // In-between: small attenuation proportional to non-GOOD share.
  const nonGoodRatio = 1 - goodRatio;
  const factor = 1.0 + 0.5 * nonGoodRatio;
  return { factor: Math.round(factor * 100) / 100, distribution };
}

/**
 * Recent prompts for a project, oldest-first paginated. Used by the
 * cockpit's Prompt-quality card.
 */
export async function listRecentPromptsForProject(
  organizationId: string,
  projectId: string,
  { limit = 25, offset = 0 }: { limit?: number; offset?: number } = {},
) {
  const rows = await db.query.promptLogs.findMany({
    where: and(eq(promptLogs.organizationId, organizationId), eq(promptLogs.projectId, projectId)),
    orderBy: (t, { desc }) => desc(t.createdAt),
    limit,
    offset,
  });
  return rows;
}

/**
 * Recent prompts for a specific MCP session (matches audit_log entity_id).
 */
export async function listPromptsForSession(
  organizationId: string,
  mcpSessionId: string,
  { limit = 50 }: { limit?: number } = {},
) {
  return db.query.promptLogs.findMany({
    where: and(eq(promptLogs.organizationId, organizationId), eq(promptLogs.mcpSessionId, mcpSessionId)),
    orderBy: (t, { asc }) => asc(t.createdAt),
    limit,
  });
}

/**
 * Fetch one prompt row with its project, scoped to the org.
 */
export async function getPromptDetail(
  organizationId: string,
  promptId: string,
) {
  return db.query.promptLogs.findFirst({
    where: and(eq(promptLogs.organizationId, organizationId), eq(promptLogs.id, promptId)),
    with: { project: true },
  });
}
