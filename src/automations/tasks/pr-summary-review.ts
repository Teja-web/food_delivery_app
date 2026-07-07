/**
 * Coznt Cat PR summary review task.
 *
 * Triggered from GitHub pull_request webhooks. V1 stores structured PR
 * summaries in `intelligence`, writes audit rows, and posts/updates a
 * GitHub PR conversation comment when the GitHub App installation can write.
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
  createIssueComment,
  findInstallationForRepo,
  isConfigured as isGithubAppConfigured,
  listPullRequestComments,
  listPullRequestFilesWithPatches,
  listPullRequestReviewComments,
  postCheckRun,
  type PullRequestFileWithPatch,
  type PullRequestIssueComment,
  type PullRequestReviewComment,
  updateIssueComment,
} from "@/lib/integrations/github-app";
import { buildProjectArtifactsPromptBlock } from "@/operations/artifacts";
import { recordSkillOutcome } from "@/operations/skill/skill-autonomy";
import {
  COZNT_CAT_SUMMARY_MARKER,
  renderPrSummaryMarkdown,
} from "./pr-summary-markdown";

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

async function resolvePrSummaryInstallation(input: {
  payloadInstallationId: string | null;
  ownerRepo: string;
}): Promise<{ installationId: string | null; skipReason: string }> {
  if (!isGithubAppConfigured()) {
    return {
      installationId: null,
      skipReason: "GitHub App credentials are not configured",
    };
  }
  if (input.payloadInstallationId) {
    return {
      installationId: input.payloadInstallationId,
      skipReason: "",
    };
  }

  try {
    const installationId = await findInstallationForRepo(input.ownerRepo);
    if (installationId) {
      return {
        installationId,
        skipReason: "",
      };
    }
    return {
      installationId: null,
      skipReason: `webhook payload did not include a GitHub App installation id and no installed Coznt GitHub App was found for ${input.ownerRepo}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      installationId: null,
      skipReason: `webhook payload did not include a GitHub App installation id and installation lookup failed for ${input.ownerRepo}: ${message}`,
    };
  }
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

    const installation = await resolvePrSummaryInstallation({
      payloadInstallationId: input.installationId,
      ownerRepo: input.ownerRepo,
    });
    const rawFiles = installation.installationId
      ? await listPullRequestFilesWithPatches({
          installationId: installation.installationId,
          ownerRepo: input.ownerRepo,
          pullNumber: input.pullNumber,
        })
      : [];
    const { issueComments, reviewComments } = installation.installationId
      ? await readPrDiscussionContext({
          installationId: installation.installationId,
          ownerRepo: input.ownerRepo,
          pullNumber: input.pullNumber,
        })
      : { issueComments: [], reviewComments: [] };
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
      issueComments: issueComments.filter((comment) => !isCozntCatSummaryComment(comment.body)),
      reviewComments,
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
    const githubWriteback = installation.installationId
      ? await writeGithubSummaryArtifacts({
          organizationId: input.organizationId,
          installationId: installation.installationId,
          ownerRepo: input.ownerRepo,
          pullNumber: input.pullNumber,
          prTitle: input.prTitle,
          prBody: input.prBody,
          prUrl: input.prUrl,
          headSha: input.headSha,
          review: object,
          diff,
          issueComments,
          reviewComments,
          generatedAt: completedAt,
          webhookEventId: input.webhookEventId,
          prRef,
        })
      : {
          skipped: true as const,
          reason: installation.skipReason,
        };
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
        payloadInstallationId: input.installationId,
        resolvedInstallationId: installation.installationId,
      },
      diff: {
        totalFiles: diff.totalFiles,
        includedFiles: diff.includedFiles,
        truncatedFiles: diff.truncatedFiles,
        totalPatchChars: diff.totalPatchChars,
        truncatedPatches: diff.files.filter((file) => file.truncatedPatch).map((file) => file.filename),
      },
      githubWriteback,
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
      summary: writebackSummary(prRef, githubWriteback),
      after: {
        webhookEventId: input.webhookEventId,
        intelligenceId: intel.id,
        pr: data.pr,
        diff: data.diff,
        githubWriteback,
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

async function readPrDiscussionContext(input: {
  installationId: string;
  ownerRepo: string;
  pullNumber: number;
}): Promise<{
  issueComments: PullRequestIssueComment[];
  reviewComments: PullRequestReviewComment[];
}> {
  const [issueResult, reviewResult] = await Promise.allSettled([
    listPullRequestComments(input),
    listPullRequestReviewComments(input),
  ]);
  return {
    issueComments: issueResult.status === "fulfilled" ? issueResult.value : [],
    reviewComments: reviewResult.status === "fulfilled" ? reviewResult.value : [],
  };
}

function isCozntCatSummaryComment(body: string): boolean {
  return body.trimStart().startsWith(COZNT_CAT_SUMMARY_MARKER);
}

async function writeGithubSummaryArtifacts(input: {
  organizationId: string;
  installationId: string;
  ownerRepo: string;
  pullNumber: number;
  prTitle: string;
  prBody?: string | null;
  prUrl?: string | null;
  headSha?: string | null;
  review: PrSummaryReview;
  diff: PreparedPrSummaryDiff;
  issueComments: PullRequestIssueComment[];
  reviewComments: PullRequestReviewComment[];
  generatedAt: Date;
  webhookEventId: string;
  prRef: string;
}): Promise<
  | {
      skipped: false;
      commentId: number | null;
      commentUrl: string | null;
      action: "created" | "updated" | "none";
      checkRunId: number | null;
    }
  | { skipped: false; error: string }
> {
  try {
    const body = renderPrSummaryMarkdown(input);
    const existing = input.issueComments.find((comment) => isCozntCatSummaryComment(comment.body));
    const comment = existing
      ? await updateIssueComment({
          installationId: input.installationId,
          ownerRepo: input.ownerRepo,
          commentId: existing.id,
          body,
        })
      : await createIssueComment({
          installationId: input.installationId,
          ownerRepo: input.ownerRepo,
          issueNumber: input.pullNumber,
          body,
        });
    if (!comment) {
      throw new Error(
        "GitHub PR comment write returned no comment. Check GitHub App credentials and Issues write permission.",
      );
    }
    const checkRun = input.headSha
      ? await postCheckRun({
          installationId: input.installationId,
          ownerRepo: input.ownerRepo,
          headSha: input.headSha,
          name: "coznt cat",
          conclusion: "success",
          title: "Coznt Cat PR summary ready",
          summary: input.review.summary.slice(0, 600),
          text: body.slice(0, 60_000),
        })
      : null;

    await writePrSummaryAudit({
      organizationId: input.organizationId,
      action: "github.pr_summary.commented",
      entityId: input.prRef,
      summary: `Coznt Cat ${existing ? "updated" : "posted"} a GitHub PR summary comment for ${input.prRef}.`,
      after: {
        webhookEventId: input.webhookEventId,
        ownerRepo: input.ownerRepo,
        pullNumber: input.pullNumber,
        commentId: comment?.id ?? null,
        commentUrl: comment?.url ?? null,
        checkRunId: checkRun?.id ?? null,
      },
    });

    return {
      skipped: false,
      commentId: comment.id,
      commentUrl: comment.url,
      action: existing ? "updated" : "created",
      checkRunId: checkRun?.id ?? null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writePrSummaryAudit({
      organizationId: input.organizationId,
      action: "github.pr_summary.comment_failed",
      entityId: input.prRef,
      summary: `Coznt Cat generated ${input.prRef} but could not write the GitHub PR comment.`,
      after: {
        webhookEventId: input.webhookEventId,
        ownerRepo: input.ownerRepo,
        pullNumber: input.pullNumber,
        error: message,
      },
    });
    return { skipped: false, error: message };
  }
}

function writebackSummary(
  prRef: string,
  writeback:
    | { skipped: true; reason: string }
    | {
        skipped: false;
        commentId: number | null;
        action: "created" | "updated" | "none";
        checkRunId: number | null;
      }
    | { skipped: false; error: string },
): string {
  if ("reason" in writeback) {
    return `Coznt Cat summarized ${prRef}; GitHub comment writeback was skipped (${writeback.reason}).`;
  }
  if ("error" in writeback) {
    return `Coznt Cat summarized ${prRef}; GitHub comment writeback failed.`;
  }
  return `Coznt Cat completed PR summary for ${prRef} and ${writeback.action} the GitHub PR comment.`;
}

function normalizeFileStatus(status: string): PrSummaryFileStatus {
  if (status === "added" || status === "modified" || status === "removed" || status === "renamed") {
    return status;
  }
  return "changed";
}

async function writePrSummaryAudit(input: {
  organizationId: string;
  action:
    | "github.pr_summary.generated"
    | "github.pr_summary.failed"
    | "github.pr_summary.commented"
    | "github.pr_summary.comment_failed";
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
