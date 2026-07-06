/**
 * Coznt Cat PR summary review task.
 *
 * Triggered from GitHub pull_request webhooks. V1 stores structured PR
 * summaries in `intelligence` and does not write back to GitHub.
 */

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db/client";
import { automationLog } from "@/db/schema/audit/automation-log";
import { auditLogs } from "@/db/schema/audit/audit-log";
import { intelligence } from "@/db/schema/intelligence";
import { projects } from "@/db/schema/project";
import { skills } from "@/db/schema/skill/skill";
import {
  PR_SUMMARY_REVIEWER_SLUG,
  prSummaryReviewSchema,
  prSummaryReviewerAgent,
  type PrSummaryFileStatus,
  type PrSummaryReview,
} from "@/automations/agents/pr-summary-reviewer/definition";
import {
  prSummaryPromptWithContext,
  type PrSummaryPromptFile,
} from "@/automations/agents/pr-summary-reviewer/prompt";
import { generate, DEFAULT_MODEL } from "@/lib/ai";
import {
  listPullRequestFilesWithPatches,
  type PullRequestFileWithPatch,
} from "@/lib/integrations/github-app";
import { buildProjectArtifactsPromptBlock } from "@/operations/artifacts";
import { recordSkillOutcome } from "@/operations/skill/skill-autonomy";

const TRIGGER_ACTIONS = new Set(["opened", "synchronize", "reopened", "edited", "ready_for_review"]);
const MAX_FILES = 80;
const MAX_PATCH_CHARS_PER_FILE = 8_000;
const MAX_TOTAL_PATCH_CHARS = 60_000;

export interface PrSummaryReviewTaskInput {
  organizationId: string;
  projectId: string;
  ownerRepo: string;
  installationId: string | null;
  pullNumber: number;
  action: string | null;
  draft: boolean;
  prTitle: string;
  prBody?: string | null;
  prUrl?: string | null;
  baseSha?: string | null;
  headSha?: string | null;
  webhookEventId: string;
}

export interface PreparedPrSummaryDiff {
  files: PrSummaryPromptFile[];
  totalFiles: number;
  includedFiles: number;
  truncatedFiles: boolean;
  totalPatchChars: number;
}

export function shouldRunPrSummaryReview(input: {
  action?: string | null;
  draft?: boolean | null;
}): boolean {
  if (!input.action || !TRIGGER_ACTIONS.has(input.action)) return false;
  if (input.draft === true && input.action !== "ready_for_review") return false;
  return true;
}

export function preparePrSummaryDiff(files: PullRequestFileWithPatch[]): PreparedPrSummaryDiff {
  const included = files.slice(0, MAX_FILES);
  let totalPatchChars = 0;
  const prepared: PrSummaryPromptFile[] = [];

  for (const file of included) {
    const rawPatch = file.patch ?? "";
    const remainingBudget = Math.max(0, MAX_TOTAL_PATCH_CHARS - totalPatchChars);
    const patchBudget = Math.min(MAX_PATCH_CHARS_PER_FILE, remainingBudget);
    const patch = rawPatch.slice(0, patchBudget);
    totalPatchChars += patch.length;
    prepared.push({
      filename: file.filename,
      status: normalizeFileStatus(file.status),
      additions: file.additions,
      deletions: file.deletions,
      patch: patch || null,
      previousFilename: file.previousFilename,
      truncatedPatch: rawPatch.length > patch.length,
    });
  }

  return {
    files: prepared,
    totalFiles: files.length,
    includedFiles: prepared.length,
    truncatedFiles: files.length > prepared.length,
    totalPatchChars,
  };
}

async function ensureSkillRow(organizationId: string): Promise<string> {
  const existing = await db.query.skills.findFirst({
    where: and(eq(skills.organizationId, organizationId), eq(skills.slug, PR_SUMMARY_REVIEWER_SLUG)),
    columns: { id: true },
  });
  if (existing) return existing.id;

  const [created] = await db
    .insert(skills)
    .values({
      organizationId,
      projectId: null,
      slug: PR_SUMMARY_REVIEWER_SLUG,
      name: prSummaryReviewerAgent.name,
      description: prSummaryReviewerAgent.description,
      body: prSummaryReviewerAgent.systemPrompt ?? "",
      tags: ["agent", "code-review", "github"],
      enabled: true,
    })
    .returning({ id: skills.id });
  return created.id;
}

export async function runPrSummaryReviewTask(
  input: PrSummaryReviewTaskInput,
): Promise<{ review: PrSummaryReview; intelligenceId: string } | null> {
  if (!shouldRunPrSummaryReview({ action: input.action, draft: input.draft })) return null;

  const skillId = await ensureSkillRow(input.organizationId);
  const runId = nanoid();
  const traceId = nanoid();
  const startedAt = new Date();
  const prRef = `github:${input.ownerRepo}#${input.pullNumber}`;

  try {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, input.projectId), eq(projects.organizationId, input.organizationId)),
      columns: { id: true, name: true },
    });
    if (!project) throw new Error("project not found");

    const rawFiles = input.installationId
      ? await listPullRequestFilesWithPatches({
          installationId: input.installationId,
          ownerRepo: input.ownerRepo,
          pullNumber: input.pullNumber,
        })
      : [];
    const diff = preparePrSummaryDiff(rawFiles);
    const artifactsPromptBlock = await buildProjectArtifactsPromptBlock(input.organizationId, input.projectId);
    const prompt = prSummaryPromptWithContext({
      projectName: project.name,
      ownerRepo: input.ownerRepo,
      prRef,
      prTitle: input.prTitle,
      prBody: input.prBody,
      baseSha: input.baseSha,
      headSha: input.headSha,
      ...diff,
    });

    const { text, object } = await generate({
      agent: {
        ...prSummaryReviewerAgent,
        systemPrompt: artifactsPromptBlock
          ? `${prSummaryReviewerAgent.systemPrompt}\n\n${artifactsPromptBlock}`
          : prSummaryReviewerAgent.systemPrompt,
      },
      prompt,
      output: prSummaryReviewSchema,
    });

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    const data = {
      ...object,
      pr: {
        ref: prRef,
        ownerRepo: input.ownerRepo,
        number: input.pullNumber,
        title: input.prTitle,
        url: input.prUrl ?? null,
        baseSha: input.baseSha ?? null,
        headSha: input.headSha ?? null,
        action: input.action,
      },
      diff: {
        totalFiles: diff.totalFiles,
        includedFiles: diff.includedFiles,
        truncatedFiles: diff.truncatedFiles,
        totalPatchChars: diff.totalPatchChars,
        truncatedPatches: diff.files.filter((file) => file.truncatedPatch).map((file) => file.filename),
      },
      generatedAt: completedAt.toISOString(),
    };

    await db.insert(automationLog).values({
      id: runId,
      organizationId: input.organizationId,
      taskId: `agent:${PR_SUMMARY_REVIEWER_SLUG}`,
      traceId,
      entityType: "work_item",
      entityId: prRef,
      actorType: "agent",
      actorId: PR_SUMMARY_REVIEWER_SLUG,
      status: "succeeded",
      durationMs,
      outputTable: "intelligence",
      createdAt: startedAt,
      completedAt,
    });

    const [intel] = await db
      .insert(intelligence)
      .values({
        organizationId: input.organizationId,
        entityType: "work_item",
        entityId: prRef,
        kind: "pr-summary-review",
        summary: object.summary.slice(0, 240),
        body: text,
        data: data as Record<string, unknown>,
        modelId: prSummaryReviewerAgent.model ?? DEFAULT_MODEL,
        lastRunId: runId,
        lastEvaluatedAt: completedAt,
        evaluationCount: 1,
      })
      .onConflictDoUpdate({
        target: [intelligence.entityType, intelligence.entityId, intelligence.kind],
        set: {
          summary: object.summary.slice(0, 240),
          body: text,
          data: data as Record<string, unknown>,
          modelId: prSummaryReviewerAgent.model ?? DEFAULT_MODEL,
          lastRunId: runId,
          lastEvaluatedAt: completedAt,
          updatedAt: completedAt,
        },
      })
      .returning({ id: intelligence.id });

    await recordSkillOutcome({
      skillId,
      projectId: input.projectId,
      invocationId: runId,
      verdict: "success",
    });

    await writePrSummaryAudit({
      organizationId: input.organizationId,
      action: "github.pr_summary.generated",
      entityId: prRef,
      summary: `Coznt Cat summarized ${prRef}.`,
      after: {
        webhookEventId: input.webhookEventId,
        intelligenceId: intel.id,
        pr: data.pr,
        diff: data.diff,
      },
    });

    return { review: object, intelligenceId: intel.id };
  } catch (err) {
    const completedAt = new Date();
    const message = err instanceof Error ? err.message : String(err);
    await db.insert(automationLog).values({
      id: runId,
      organizationId: input.organizationId,
      taskId: `agent:${PR_SUMMARY_REVIEWER_SLUG}`,
      traceId,
      entityType: "work_item",
      entityId: prRef,
      actorType: "agent",
      actorId: PR_SUMMARY_REVIEWER_SLUG,
      status: "failed",
      errorMessage: message,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      createdAt: startedAt,
      completedAt,
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
      // Autonomy ledger is observability and must not mask the original failure.
    }

    await writePrSummaryAudit({
      organizationId: input.organizationId,
      action: "github.pr_summary.failed",
      entityId: prRef,
      summary: `Coznt Cat failed to summarize ${prRef}.`,
      after: {
        webhookEventId: input.webhookEventId,
        pr: {
          ref: prRef,
          ownerRepo: input.ownerRepo,
          number: input.pullNumber,
          title: input.prTitle,
          url: input.prUrl ?? null,
          action: input.action,
        },
        error: message,
      },
    });

    return null;
  }
}

function normalizeFileStatus(status: string): PrSummaryFileStatus {
  if (status === "added" || status === "modified" || status === "removed" || status === "renamed") {
    return status;
  }
  return "changed";
}

async function writePrSummaryAudit(input: {
  organizationId: string;
  action: "github.pr_summary.generated" | "github.pr_summary.failed";
  entityId: string;
  summary: string;
  after: Record<string, unknown>;
}): Promise<void> {
  await db.insert(auditLogs).values({
    organizationId: input.organizationId,
    actorType: "integration",
    actorId: "github",
    actorName: "GitHub",
    action: input.action,
    entityType: "work_item",
    entityId: input.entityId,
    summary: input.summary,
    before: null,
    after: input.after,
    invokedVia: `webhook:github:${PR_SUMMARY_REVIEWER_SLUG}`,
  });
}
