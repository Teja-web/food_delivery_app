/**
 * Skill invocation — runs a stored skill's prompt against an input and
 * records the result.
 *
 * For each call:
 *   1. Resolve the skill by slug, scoped to the org and (optionally) project.
 *   2. Pass `skill.body` as the system prompt and `input` (JSON) as the user
 *      prompt to the configured model.
 *   3. If `outputSchema` is set on the skill, parse the model output as JSON
 *      and shallow-validate the shape; otherwise return raw text.
 *   4. Append an `automation_logs` row + an `intelligence` row keyed
 *      to the caller-supplied entity (or `skill:<id>` if none).
 *
 * The input is *not* schema-validated yet — we'd need a JSON-Schema-to-Zod
 * converter for that. The skill author is responsible for documenting input
 * shape in `inputSchema` until then.
 */

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db/client";
import { skills } from "@/db/schema/skill/skill";
import { automationLog } from "@/db/schema/audit/automation-log";
import { intelligence } from "@/db/schema/intelligence";
import { generate, DEFAULT_MODEL, type ModelId } from "@/lib/ai";
import { getActionContext } from "@/lib/auth/context";
import { applyActionPolicyRules } from "@/operations/rule-engine";
import { recordSkillOutcome } from "@/operations/skill/skill-autonomy";
import { buildEffectiveStandardsPromptBlock } from "@/operations/standards";

export interface SkillInvocationRequest {
  slug: string;
  input: unknown;
  entityType?: string;
  entityId?: string;
  /** Override the model id (otherwise uses DEFAULT_MODEL). */
  model?: ModelId;
}

export interface SkillInvocationResult {
  skillId: string;
  runId: string;
  /** Parsed JSON if the model returned a valid JSON object, else raw text. */
  output: unknown;
  /** Raw model output, always populated. */
  text: string;
  durationMs: number;
  intelligenceId: string;
}

function resolveSkillBody(skill: { body: string }, input: unknown): string {
  return `# Input\n\n\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\`\``;
}

function tryParseJson(text: string): unknown {
  // Strip ```json fences if present
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  const raw = fenced ? fenced[1] : text;
  try {
    return JSON.parse(raw.trim());
  } catch {
    return null;
  }
}

export async function invokeSkill(req: SkillInvocationRequest): Promise<SkillInvocationResult> {
  const ctx = await getActionContext();

  const projectFilter = ctx.projectId
    ? or(isNull(skills.projectId), eq(skills.projectId, ctx.projectId))
    : isNull(skills.projectId);

  const skill = await db.query.skills.findFirst({
    where: and(
      eq(skills.slug, req.slug),
      eq(skills.organizationId, ctx.organizationId),
      eq(skills.enabled, true),
      projectFilter,
    ),
  });

  if (!skill) {
    const err = new Error(`Skill "${req.slug}" not found, disabled, or out of scope`) as Error & { status?: number };
    err.status = 404;
    throw err;
  }

  const runId = nanoid();
  const startedAt = new Date();
  const traceId = nanoid();

  // Action-policy enforcement. See docs/borrowings-from-ai-sdlc-framework.md
  // section 2. Skills don't yet know their full action set at invocation
  // time, so we pass the skill slug as `command` and `skill.body` line count
  // as a coarse proxy for change scope.
  //
  // TODO: as we add file-mutating skills, expand `ProposedAction` with the
  // real list of paths the skill will touch, an `hasTests` signal derived
  // from the invocation input, and the concrete shell commands the skill
  // intends to run. The validator already supports those fields — they're
  // simply unknown at this layer today.
  const bodyLineCount = skill.body.split("\n").length;
  await applyActionPolicyRules(
    "skill",
    {
      command: skill.slug,
      fileCount: bodyLineCount,
    },
    { organizationId: ctx.organizationId, projectId: ctx.projectId ?? skill.projectId ?? null },
  );

  const resolvedModel = req.model ?? DEFAULT_MODEL;
  const standardsPromptBlock = ctx.projectId
    ? await buildEffectiveStandardsPromptBlock(ctx.organizationId, ctx.projectId)
    : null;

  try {
    const result = await generate({
      agent: {
        slug: skill.slug,
        name: skill.name,
        systemPrompt: standardsPromptBlock
          ? `${skill.body}\n\n${standardsPromptBlock}`
          : skill.body,
        ...(req.model && { model: req.model }),
      },
      prompt: resolveSkillBody(skill, req.input),
    });

    const parsed = skill.outputSchema ? tryParseJson(result.text) : null;
    const output = parsed ?? result.text;
    const durationMs = Date.now() - startedAt.getTime();

    await db.insert(automationLog).values({
      id: runId,
      organizationId: ctx.organizationId,
      taskId: `skill:${skill.slug}`,
      traceId,
      entityType: req.entityType ?? "skill",
      entityId: req.entityId ?? skill.id,
      actorType: "api",
      actorId: ctx.userId,
      status: "succeeded",
      durationMs,
      outputTable: "intelligence",
      createdAt: startedAt,
      completedAt: new Date(),
    });

    const [intel] = await db
      .insert(intelligence)
      .values({
        organizationId: ctx.organizationId,
        entityType: req.entityType ?? "skill",
        entityId: req.entityId ?? skill.id,
        kind: skill.slug,
        summary: skill.description ?? skill.name,
        body: typeof output === "string" ? output : null,
        data: typeof output === "object" && output !== null ? (output as Record<string, unknown>) : null,
        modelId: resolvedModel,
        lastRunId: runId,
        lastEvaluatedAt: new Date(),
        evaluationCount: 1,
      })
      .onConflictDoUpdate({
        target: [intelligence.entityType, intelligence.entityId, intelligence.kind],
        set: {
          summary: skill.description ?? skill.name,
          body: typeof output === "string" ? output : null,
          data: typeof output === "object" && output !== null ? (output as Record<string, unknown>) : null,
          modelId: resolvedModel,
          lastRunId: runId,
          lastEvaluatedAt: new Date(),
          updatedAt: new Date(),
          evaluationCount: sql`${intelligence.evaluationCount} + 1`,
        },
      })
      .returning({ id: intelligence.id });

    // === autonomy ledger ================================================
    // Successful invocation → "success" verdict, scored against the project
    // the agent was working on (per-project autonomy). Best-effort: failures
    // here must not poison the invocation result.
    try {
      await recordSkillOutcome({
        skillId: skill.id,
        projectId: ctx.projectId ?? null,
        invocationId: runId,
        verdict: "success",
      });
    } catch {
      // swallow — ledger is observability, not load-bearing for the call
    }
    // ====================================================================

    return {
      skillId: skill.id,
      runId,
      output,
      text: result.text,
      durationMs,
      intelligenceId: intel.id,
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt.getTime();
    await db.insert(automationLog).values({
      id: runId,
      organizationId: ctx.organizationId,
      taskId: `skill:${skill.slug}`,
      traceId,
      entityType: req.entityType ?? "skill",
      entityId: req.entityId ?? skill.id,
      actorType: "api",
      actorId: ctx.userId,
      status: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs,
      createdAt: startedAt,
      completedAt: new Date(),
    });

    // === autonomy ledger ================================================
    // Thrown LLM error → "incident" at severity "high", scored against the
    // project the agent was working on. Best-effort.
    try {
      await recordSkillOutcome({
        skillId: skill.id,
        projectId: ctx.projectId ?? null,
        invocationId: runId,
        verdict: "incident",
        severity: "high",
      });
    } catch {
      // swallow
    }
    // ====================================================================

    throw err;
  }
}
