/**
 * classify-change-risk — Milestone C orchestration for the
 * `change-risk-classifier` agent.
 *
 * Called from `runExecutionGate` (in `process-webhook-event.ts`) after the
 * deterministic gate verdict has been posted to GitHub. The AI run augments
 * the verdict with rationale + recommended gates and writes the result to
 * `intelligence` so the cockpit / approvals inbox can surface it.
 *
 * Failure isolation: any error here is swallowed by the caller and never
 * blocks the deterministic pipeline.
 */

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db/client";
import { skills } from "@/db/schema/skill";
import { intelligence } from "@/db/schema/intelligence";
import { automationLog } from "@/db/schema/automation-log";
import { generate, DEFAULT_MODEL } from "@/lib/ai";
import {
  CHANGE_RISK_CLASSIFIER_SLUG,
  changeRiskClassifierAgent,
  changeRiskSchema,
  type ChangeRiskClassification,
} from "@/automations/agents/definitions/change-risk-classifier";
import { changeRiskClassifierPromptWithContext } from "@/automations/agents/prompts/change-risk-classifier";
import { recordSkillOutcome } from "@/operations/skill-autonomy";

export interface ClassifyChangeRiskInput {
  organizationId: string;
  projectId: string;
  projectName: string;
  projectPhase: string;
  prRef: string;
  prTitle: string;
  prBody?: string | null;
  files: Array<{ filename: string; additions: number; deletions: number }>;
  totalLines: number;
  criticalPaths: string[];
  productionCriticalPaths: string[];
  heuristicRisk: string;
  activeRules: string[];
}

/**
 * Lazy-upsert the skill row that owns the agent's outcomes. Org-wide so the
 * autonomy ledger surfaces it under "available everywhere" regardless of
 * which project the first invocation hit.
 */
async function ensureSkillRow(organizationId: string): Promise<string> {
  const existing = await db.query.skills.findFirst({
    where: and(eq(skills.organizationId, organizationId), eq(skills.slug, CHANGE_RISK_CLASSIFIER_SLUG)),
    columns: { id: true },
  });
  if (existing) return existing.id;

  const [created] = await db
    .insert(skills)
    .values({
      organizationId,
      projectId: null,
      slug: CHANGE_RISK_CLASSIFIER_SLUG,
      name: changeRiskClassifierAgent.name,
      description: changeRiskClassifierAgent.description,
      body: changeRiskClassifierAgent.systemPrompt ?? "",
      tags: ["agent", "code-review"],
      enabled: true,
    })
    .returning({ id: skills.id });
  return created.id;
}

function buildFileSummary(files: ClassifyChangeRiskInput["files"]): string {
  if (files.length === 0) return "";
  return files
    .slice(0, 60)
    .map((f) => `${f.filename}\t+${f.additions} -${f.deletions}`)
    .join("\n");
}

export async function classifyChangeRiskTask(
  input: ClassifyChangeRiskInput,
): Promise<{ classification: ChangeRiskClassification; intelligenceId: string } | null> {
  const skillId = await ensureSkillRow(input.organizationId);
  const runId = nanoid();
  const traceId = nanoid();
  const startedAt = new Date();

  const prompt = changeRiskClassifierPromptWithContext({
    projectName: input.projectName,
    projectPhase: input.projectPhase,
    prTitle: input.prTitle,
    prRef: input.prRef,
    prBody: input.prBody ?? null,
    fileSummary: buildFileSummary(input.files),
    totalLines: input.totalLines,
    criticalPaths: input.criticalPaths,
    productionCriticalPaths: input.productionCriticalPaths,
    heuristicRisk: input.heuristicRisk,
    activeRules: input.activeRules,
  });

  try {
    const { text, object } = await generate({
      agent: changeRiskClassifierAgent,
      prompt,
      output: changeRiskSchema,
    });

    const durationMs = Date.now() - startedAt.getTime();

    await db.insert(automationLog).values({
      id: runId,
      organizationId: input.organizationId,
      taskId: `agent:${CHANGE_RISK_CLASSIFIER_SLUG}`,
      traceId,
      entityType: "work_item",
      entityId: input.prRef,
      actorType: "agent",
      actorId: CHANGE_RISK_CLASSIFIER_SLUG,
      status: "succeeded",
      durationMs,
      outputTable: "intelligence",
      createdAt: startedAt,
      completedAt: new Date(),
    });

    const [intel] = await db
      .insert(intelligence)
      .values({
        organizationId: input.organizationId,
        entityType: "work_item",
        entityId: input.prRef,
        kind: "change-risk",
        summary: `${object.riskClass.toUpperCase()} — ${object.rationale.slice(0, 140)}`,
        body: text,
        data: object as unknown as Record<string, unknown>,
        modelId: changeRiskClassifierAgent.model ?? DEFAULT_MODEL,
        lastRunId: runId,
        lastEvaluatedAt: new Date(),
        evaluationCount: 1,
      })
      .onConflictDoUpdate({
        target: [intelligence.entityType, intelligence.entityId, intelligence.kind],
        set: {
          summary: `${object.riskClass.toUpperCase()} — ${object.rationale.slice(0, 140)}`,
          body: text,
          data: object as unknown as Record<string, unknown>,
          modelId: changeRiskClassifierAgent.model ?? DEFAULT_MODEL,
          lastRunId: runId,
          lastEvaluatedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning({ id: intelligence.id });

    await recordSkillOutcome({
      skillId,
      projectId: input.projectId,
      invocationId: runId,
      verdict: "success",
    });

    return { classification: object, intelligenceId: intel.id };
  } catch (err) {
    const durationMs = Date.now() - startedAt.getTime();
    await db.insert(automationLog).values({
      id: runId,
      organizationId: input.organizationId,
      taskId: `agent:${CHANGE_RISK_CLASSIFIER_SLUG}`,
      traceId,
      entityType: "work_item",
      entityId: input.prRef,
      actorType: "agent",
      actorId: CHANGE_RISK_CLASSIFIER_SLUG,
      status: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs,
      createdAt: startedAt,
      completedAt: new Date(),
    });

    try {
      await recordSkillOutcome({
        skillId,
        projectId: input.projectId,
        invocationId: runId,
        verdict: "incident",
        severity: "high",
      });
    } catch {
      // ledger is observability — never throw
    }

    return null;
  }
}
