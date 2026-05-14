/**
 * Pre/Post tool-use payload validation and handler logic.
 *
 * Called from `/api/v1/agents/pre-tool-use` and `.../post-tool-use`. These
 * are the on-ramp for IDE plugins (Claude Code, Cursor) to record what an
 * AI agent is about to do (Pre) and what happened (Post).
 *
 * Pre — applies action-policy rules AND the Milestone-D autonomy threshold
 * gate, then returns an allow/deny verdict plus the current autonomy level
 * for the (skill, project) pair. When the autonomy gate blocks, a
 * `skill_invocation` approval is opened so the action can be routed through
 * the H3 approvals inbox. The caller (the plugin) honors `allowed: false`.
 *
 * Post — appends a `skill_outcomes` row keyed by the run, and (optionally)
 * an `intelligence` row carrying the structured result. Idempotency on the
 * outcomes side is the caller's responsibility — pass a stable `runId`.
 */

import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db/client";
import { skills, type Skill } from "@/db/schema/skill";
import { approvals } from "@/db/schema/approval";
import { automationLog } from "@/db/schema/automation-log";
import { intelligence } from "@/db/schema/intelligence";
import type { ApiContext } from "@/lib/api/auth";
import { applyActionPolicyRules } from "@/operations/rule-engine";
import { getSkillAutonomy, recordSkillOutcome, LEVEL_NAMES } from "@/operations/skill-autonomy";
import { safeRevalidate } from "@/lib/safe-revalidate";

export const preToolUseSchema = z.object({
  skillSlug: z.string().min(1).describe("The skill the calling agent identifies as."),
  tool: z.string().min(1).describe("Concrete tool name, e.g. `bash`, `edit`, `write`."),
  command: z.string().optional().describe("Shell command or short action descriptor."),
  paths: z.array(z.string()).max(200).optional(),
  fileCount: z.number().int().min(0).optional(),
  hasTests: z.boolean().optional(),
  sessionId: z.string().optional(),
  runId: z.string().optional(),
  projectId: z.string().optional(),
});

export type PreToolUseInput = z.infer<typeof preToolUseSchema>;

export const postToolUseSchema = z.object({
  skillSlug: z.string().min(1),
  tool: z.string().min(1),
  runId: z.string().min(1).describe("Stable id from PreToolUse so Pre and Post can be correlated."),
  durationMs: z.number().int().min(0).optional(),
  status: z.enum(["succeeded", "failed", "rolled_back", "incident"]),
  severity: z.enum(["low", "high", "critical"]).optional(),
  errorMessage: z.string().optional(),
  /** Optional structured result to store under intelligence.kind = `tool-use:<tool>`. */
  result: z.record(z.string(), z.unknown()).optional(),
  /** Optional human-readable summary stored alongside the result. */
  summary: z.string().optional(),
  sessionId: z.string().optional(),
  projectId: z.string().optional(),
});

export type PostToolUseInput = z.infer<typeof postToolUseSchema>;

/**
 * Resolve a skill by slug under the API context. Falls back to org-wide
 * skills (projectId null) when no project-scoped skill matches.
 */
async function resolveSkill(ctx: ApiContext, slug: string): Promise<Skill | null> {
  const projectScoped = ctx.projectId
    ? await db.query.skills.findFirst({
        where: and(
          eq(skills.organizationId, ctx.organizationId),
          eq(skills.slug, slug),
          eq(skills.projectId, ctx.projectId),
          eq(skills.enabled, true),
        ),
      })
    : null;
  if (projectScoped) return projectScoped;

  return (
    (await db.query.skills.findFirst({
      where: and(
        eq(skills.organizationId, ctx.organizationId),
        eq(skills.slug, slug),
        eq(skills.enabled, true),
      ),
    })) ?? null
  );
}

export interface PreToolUseResponse {
  allowed: boolean;
  runId: string;
  reason: string | null;
  autonomy: {
    level: number;
    levelName: (typeof LEVEL_NAMES)[number];
    /** Minimum level the skill requires on this project to dispatch. */
    requiredLevel: number;
  } | null;
  /** Set when the autonomy gate blocked the call and an approval was opened. */
  approvalId: string | null;
  violations: Array<{ ruleId: string; severity: string; message: string }>;
  skillId: string | null;
}

export async function handlePreToolUse(
  ctx: ApiContext,
  input: PreToolUseInput,
): Promise<PreToolUseResponse> {
  const skill = await resolveSkill(ctx, input.skillSlug);
  const projectId = input.projectId ?? ctx.projectId ?? null;
  const runId = input.runId ?? nanoid();

  // Action-policy gate. We pass the tool name as `command` if no explicit
  // command was supplied — that's enough for `blockedActions` globs.
  const violations = await applyActionPolicyRules(
    "skill",
    {
      command: input.command ?? input.tool,
      paths: input.paths,
      fileCount: input.fileCount,
      hasTests: input.hasTests,
    },
    { organizationId: ctx.organizationId, projectId },
  );

  const blocking = violations.filter((v) => v.severity === "error");
  const rulesAllowed = blocking.length === 0;

  // Autonomy gate. Per-project level first, falling back to org-wide if the
  // project pair hasn't earned anything yet. Required level lives on the
  // skill row (Milestone D).
  let autonomy: PreToolUseResponse["autonomy"] = null;
  let autonomyGated = false;
  if (skill) {
    const perProject = await getSkillAutonomy(skill.id, projectId);
    const effective = perProject.level > 0 ? perProject : await getSkillAutonomy(skill.id, null);
    autonomy = {
      level: effective.level,
      levelName: effective.levelName,
      requiredLevel: skill.minAutonomyLevel,
    };
    autonomyGated = effective.level < skill.minAutonomyLevel;
  }

  const allowed = rulesAllowed && !autonomyGated;
  const ruleReason = rulesAllowed ? null : blocking.map((v) => v.ruleTitle).join("; ");
  const autonomyReason = autonomyGated
    ? `autonomy_gate: skill at level ${autonomy?.level} but ${autonomy?.requiredLevel} required`
    : null;
  const reason = [ruleReason, autonomyReason].filter(Boolean).join("; ") || null;

  // Route blocked autonomy decisions into the approvals inbox so a human
  // (or, eventually, a senior agent) can ack.
  let approvalId: string | null = null;
  if (autonomyGated && skill) {
    const [row] = await db
      .insert(approvals)
      .values({
        organizationId: ctx.organizationId,
        entityType: "skill_invocation",
        entityId: runId,
        projectId,
        requestedById: `agent:${input.skillSlug}`,
        requestedByName: skill.name,
        requesterNote: `${input.tool}${input.command ? `: ${input.command}` : ""}`,
        status: "pending",
      })
      .returning({ id: approvals.id });
    approvalId = row.id;
    safeRevalidate("/approvals");
  }

  // Log the pre-tool-use decision regardless of outcome.
  await db.insert(automationLog).values({
    id: runId,
    organizationId: ctx.organizationId,
    taskId: `pre-tool-use:${input.tool}`,
    entityType: "skill",
    entityId: skill?.id ?? input.skillSlug,
    actorType: "agent",
    actorId: input.skillSlug,
    status: allowed ? "succeeded" : "blocked",
    errorMessage: allowed ? null : reason,
    createdAt: new Date(),
  });

  return {
    allowed,
    runId,
    reason,
    autonomy,
    approvalId,
    violations: violations.map((v) => ({
      ruleId: v.ruleId,
      severity: v.severity,
      message: v.message,
    })),
    skillId: skill?.id ?? null,
  };
}

export interface PostToolUseResponse {
  recorded: boolean;
  outcomeId: string | null;
  intelligenceId: string | null;
}

export async function handlePostToolUse(
  ctx: ApiContext,
  input: PostToolUseInput,
): Promise<PostToolUseResponse> {
  const skill = await resolveSkill(ctx, input.skillSlug);
  if (!skill) {
    const err = new Error(`Skill "${input.skillSlug}" not found or disabled`) as Error & { status?: number };
    err.status = 404;
    throw err;
  }

  const projectId = input.projectId ?? ctx.projectId ?? null;
  const completedAt = new Date();

  // Finalize the automation log started by PreToolUse. If no PreToolUse
  // ran (caller skipped it), the runId is still inserted here.
  await db
    .insert(automationLog)
    .values({
      id: input.runId,
      organizationId: ctx.organizationId,
      taskId: `post-tool-use:${input.tool}`,
      entityType: "skill",
      entityId: skill.id,
      actorType: "agent",
      actorId: input.skillSlug,
      status: input.status,
      durationMs: input.durationMs ?? null,
      errorMessage: input.errorMessage ?? null,
      createdAt: new Date(),
      completedAt,
    })
    .onConflictDoUpdate({
      target: [automationLog.id],
      set: {
        status: input.status,
        durationMs: input.durationMs ?? null,
        errorMessage: input.errorMessage ?? null,
        completedAt,
      },
    });

  const verdict =
    input.status === "succeeded"
      ? "success"
      : input.status === "rolled_back"
        ? "rolled_back"
        : "incident";
  const severity =
    input.severity ?? (input.status === "failed" || input.status === "incident" ? "high" : null);

  const outcome = await recordSkillOutcome({
    skillId: skill.id,
    projectId,
    invocationId: input.runId,
    verdict,
    severity,
  });

  let intelligenceId: string | null = null;
  if (input.result || input.summary) {
    const [intel] = await db
      .insert(intelligence)
      .values({
        organizationId: ctx.organizationId,
        entityType: "skill",
        entityId: skill.id,
        kind: `tool-use:${input.tool}`,
        summary: input.summary ?? null,
        body: null,
        data: input.result ?? null,
        modelId: null,
        lastRunId: input.runId,
        lastEvaluatedAt: completedAt,
        evaluationCount: 1,
      })
      .onConflictDoUpdate({
        target: [intelligence.entityType, intelligence.entityId, intelligence.kind],
        set: {
          summary: input.summary ?? null,
          data: input.result ?? null,
          lastRunId: input.runId,
          lastEvaluatedAt: completedAt,
          updatedAt: completedAt,
        },
      })
      .returning({ id: intelligence.id });
    intelligenceId = intel.id;
  }

  return {
    recorded: true,
    outcomeId: outcome.id,
    intelligenceId,
  };
}
