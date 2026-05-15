/**
 * Webhook event processor — runs in the worker against rows written by the
 * `/api/v1/webhooks/[source]` ingest endpoint.
 *
 * For each unprocessed `webhook_events` row we:
 *   1. Derive an `externalKey` from the payload (provider-specific).
 *   2. Resolve it to a coznt projectId via the AdapterBinding table.
 *   3. Fan out to a per-source handler (e.g. GitHub deployment_status →
 *      `recordDeployment`).
 *   4. Mark `processedAt`, or set `processingError` and leave for triage.
 *
 * AdapterBinding (see `src/db/schema/adapter-binding.ts`) is what lets us
 * map "this GitHub repo" → "this coznt project" without hard-coding it
 * in the payload.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvals } from "@/db/schema/approval";
import { gateEvaluations } from "@/db/schema/gate-evaluation";
import { deployments } from "@/db/schema/deployment";
import { projects } from "@/db/schema/project";
import { rules } from "@/db/schema/rule";
import { skills } from "@/db/schema/skill";
import { webhookEvents, type WebhookEvent } from "@/db/schema/webhook-event";
import {
  assessDeployIncident,
  assessPrAbandoned,
  assessPrReverted,
} from "@/domain/outcomes";
import { isConfigured as githubAppConfigured, postCheckRun } from "@/lib/integrations/github-app";
import { resolveProjectForWebhook } from "@/lib/integrations/resolve";
import {
  attributeSkill,
  attributeSkillFromCommitSha,
  detectRevert,
} from "@/lib/integrations/skill-attribution";
import { classifyChangeRisk, type ChangedFile } from "@/operations/change-risk";
import { recordDeployment } from "@/operations/deployments";
import { evaluatePullRequest, type GateInput } from "@/operations/execution-gate";
import {
  getSkillAutonomy,
  recordAssessorOutcome,
  recomputeSkillAutonomy,
} from "@/operations/skill-autonomy";
import { upsertWorkItem } from "@/operations/work-items";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function markProcessed(eventId: string, error?: string): Promise<void> {
  await db
    .update(webhookEvents)
    .set({ processedAt: new Date(), processingError: error ?? null })
    .where(eq(webhookEvents.id, eventId));
}

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

/**
 * Build the AdapterBinding `externalKey` for a GitHub payload.
 * Format: `host/owner/repo` (e.g. `github.com/acme/api`). The host comes
 * from the webhook payload when available (GHE), falling back to `github.com`.
 */
function githubExternalKey(payload: Json): string | null {
  const repo = asObject(payload.repository);
  const fullName = asString(repo?.full_name);
  if (!fullName) return null;
  // The `sender.url` / `repository.html_url` carry the host; prefer it for GHE.
  const htmlUrl = asString(repo?.html_url) ?? "";
  let host = "github.com";
  try {
    if (htmlUrl) host = new URL(htmlUrl).host;
  } catch {
    /* keep default */
  }
  return `${host}/${fullName}`;
}

async function handleGitHub(evt: WebhookEvent): Promise<void> {
  if (!evt.organizationId) {
    return markProcessed(evt.id, "webhook has no organizationId");
  }
  const payload = asObject(evt.payload) ?? {};
  const externalKey = githubExternalKey(payload);
  if (!externalKey) {
    return markProcessed(evt.id, "github payload missing repository.full_name");
  }

  const projectId = await resolveProjectForWebhook(evt.organizationId, "github", externalKey);
  if (!projectId) {
    return markProcessed(evt.id, `no project binding for ${externalKey}`);
  }

  // Only `deployment_status` events with a terminal state become deployment rows.
  if (evt.event === "deployment_status") {
    const deployStatus = asObject(payload.deployment_status);
    const state = asString(deployStatus?.state); // "success" | "failure" | "pending" | ...
    if (state !== "success" && state !== "failure") {
      return markProcessed(evt.id);
    }

    const deployment = asObject(payload.deployment);
    const environment = asString(deployment?.environment) ?? "production";
    const version =
      asString(deployment?.sha)?.slice(0, 12) ??
      asString(deployment?.ref) ??
      "unknown";
    const commitSha = asString(deployment?.sha);
    const ciRunUrl = asString(deployStatus?.target_url) ?? asString(deployStatus?.log_url);

    try {
      const deployment = await recordDeployment({
        projectId,
        environment,
        version,
        commitSha,
        status: state === "success" ? "success" : "failed",
        ciRunUrl,
        raw: payload,
        completedAt: new Date(),
      });

      // Synchronous incident path. A failed deploy is itself the signal;
      // we don't wait for an external incident report to call it.
      if (state === "failure" && commitSha) {
        const installation = asObject(payload.installation);
        const installationId =
          asString(installation?.id) ??
          (installation?.id != null ? String(installation.id) : null);
        await emitDeployIncidentOutcome({
          organizationId: evt.organizationId,
          projectId,
          deploymentId: deployment.id,
          environment,
          completedAt: deployment.completedAt,
          rolledBackAt: deployment.rolledBackAt,
          status: "failed",
          commitSha,
          ownerRepo: externalKey.replace(/^[^/]+\//, ""),
          installationId,
        });
      }
      return markProcessed(evt.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return markProcessed(evt.id, `recordDeployment failed: ${msg}`);
    }
  }

  if (evt.event === "pull_request") {
    const action = asString(payload.action);
    if (action === "closed") {
      // Two synchronous post-merge paths live here: revert detection and
      // abandonment. Execution-gate re-evaluation is irrelevant once the
      // PR has closed, so we don't fall through.
      return runClosedPrAssessors(evt, payload, externalKey, projectId);
    }
    return runExecutionGate(evt, payload, externalKey, projectId);
  }

  // Other GitHub events resolved to a project but aren't yet wired up.
  // TODO: implement per-event handlers (push, check_run, …).
  return markProcessed(evt.id);
}

/**
 * Execution gate — evaluate a pull_request event against the autonomy
 * ledger and post a check-run back to GitHub.
 *
 * Triggered for actions: opened, synchronize, reopened, edited. Other
 * actions (closed, assigned, …) are no-ops so we don't generate noise.
 */
async function runExecutionGate(
  evt: WebhookEvent,
  payload: Json,
  externalKey: string,
  projectId: string,
): Promise<void> {
  const action = asString(payload.action);
  const triggers = new Set(["opened", "synchronize", "reopened", "edited", "ready_for_review"]);
  if (!action || !triggers.has(action)) {
    return markProcessed(evt.id);
  }
  if (!evt.organizationId) {
    return markProcessed(evt.id, "webhook has no organizationId");
  }

  const pr = asObject(payload.pull_request);
  if (!pr) return markProcessed(evt.id, "pull_request payload missing");

  const number = typeof pr.number === "number" ? pr.number : Number(pr.number);
  if (!Number.isFinite(number)) return markProcessed(evt.id, "pull_request missing number");

  const ownerRepo = externalKey.replace(/^[^/]+\//, ""); // strip host
  const prRef = `github:${ownerRepo}#${number}`;
  const prTitle = asString(pr.title) ?? null;
  const head = asObject(pr.head);
  const headSha = asString(head?.sha) ?? null;
  const prBody = asString(pr.body) ?? null;

  // Skill attribution — head-commit trailer, falling back to PR body.
  const commits = Array.isArray(payload.commits)
    ? (payload.commits as Json[]).map((c) => ({
        message: asString(c.message) ?? "",
        sha: asString(c.id),
      }))
    : [];
  const skillSlug = attributeSkill(commits, prBody);

  // Resolve skill id + autonomy if attribution was found.
  let skillId: string | null = null;
  let skillLevel: number | null = null;
  if (skillSlug) {
    const skill = await db.query.skills.findFirst({
      where: and(eq(skills.organizationId, evt.organizationId), eq(skills.slug, skillSlug)),
    });
    if (skill) {
      skillId = skill.id;
      // Per-project autonomy, falling back to org-wide.
      const perProject = await getSkillAutonomy(skill.id, projectId);
      const orgWide = await getSkillAutonomy(skill.id, null);
      skillLevel = perProject.level > 0 ? perProject.level : orgWide.level;
    }
  }

  // Project + active rules + current phase.
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.organizationId, evt.organizationId)),
  });
  if (!project) return markProcessed(evt.id, "project not found");

  // Change risk from PR files. Fetch via GitHub when the App is configured;
  // otherwise fall back to PR-level additions/deletions if present.
  const files: ChangedFile[] = await fetchChangedFiles(
    payload,
    ownerRepo,
    number,
    skillLevel,
  );
  const risk = classifyChangeRisk({
    files,
    criticalPaths: project.criticalPaths ?? [],
    productionCriticalPaths: project.productionCriticalPaths ?? [],
  });

  // Rule violations — v1 heuristic: active rules whose `phase` matches OR
  // are unscoped, surfaced as warn/error. A future iteration runs each
  // rule's body against the diff; v1 leaves the body check to CI and just
  // exposes the rule list as informational so the verdict cites them.
  const activeRules = await db.query.rules.findMany({
    where: and(eq(rules.organizationId, evt.organizationId), eq(rules.enabled, true)),
    limit: 50,
  });
  const ruleViolations = activeRules
    .filter((r) => !r.phase || r.phase === project.phase)
    .filter((r) => r.projectId === null || r.projectId === projectId)
    .filter((r) => r.severity === "error" && hitsPath(files, r))
    .map((r) => ({ ruleId: r.slug, severity: r.severity }));

  // Human approval present? Look for an `approved` row scoped to this PR's
  // work_item entityId (we use the prRef itself as the entityId convention).
  const humanApproval = await db.query.approvals.findFirst({
    where: and(
      eq(approvals.organizationId, evt.organizationId),
      eq(approvals.entityType, "work_item"),
      eq(approvals.entityId, prRef),
      eq(approvals.status, "approved"),
    ),
  });

  const input: GateInput = {
    organizationId: evt.organizationId,
    projectId,
    prRef,
    prTitle,
    prHeadSha: headSha,
    skillId,
    skillLevel,
    changeRisk: risk.risk,
    ruleViolations,
    phase: project.phase,
    hasHumanApproval: Boolean(humanApproval),
  };

  const { evaluation, verdict } = await evaluatePullRequest(input);

  // POST the check-run if the GitHub App is configured. The installation
  // id is on the webhook payload's `installation` block.
  const installation = asObject(payload.installation);
  const installationId = asString(installation?.id) ?? (installation?.id != null ? String(installation.id) : null);
  if (githubAppConfigured() && installationId && headSha) {
    try {
      const result = await postCheckRun({
        installationId,
        ownerRepo,
        headSha,
        name: "coznt / autonomy gate",
        conclusion: verdict.verdict,
        title: verdict.reason,
        summary: `**Risk:** ${risk.risk} (${risk.totalLines} lines, ${files.length} files). **Skill:** ${skillSlug ?? "—"}.`,
        text: verdict.details.join("\n\n"),
      });
      if (result) {
        await db
          .update(
            (await import("@/db/schema/gate-evaluation")).gateEvaluations,
          )
          .set({ checkRunId: String(result.id) })
          .where(eq((await import("@/db/schema/gate-evaluation")).gateEvaluations.id, evaluation.id));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db
        .update(
          (await import("@/db/schema/gate-evaluation")).gateEvaluations,
        )
        .set({ checkRunError: msg })
        .where(eq((await import("@/db/schema/gate-evaluation")).gateEvaluations.id, evaluation.id));
    }
  }

  // Milestone C — fire the AI change-risk-classifier alongside the
  // deterministic verdict. The result is written to `intelligence` and
  // appears on the PR row in the cockpit / approvals inbox. Any failure
  // here is contained — the gate verdict has already shipped.
  try {
    const { classifyChangeRiskTask } = await import("./classify-change-risk");
    await classifyChangeRiskTask({
      organizationId: evt.organizationId,
      projectId,
      projectName: project.name,
      projectPhase: project.phase ?? "unknown",
      prRef,
      prTitle: prTitle ?? `PR #${number}`,
      prBody,
      files,
      totalLines: risk.totalLines,
      criticalPaths: project.criticalPaths ?? [],
      productionCriticalPaths: project.productionCriticalPaths ?? [],
      heuristicRisk: risk.risk,
      activeRules: ruleViolations.map((v) => v.ruleId),
    });
  } catch {
    // swallow — AI is observability, not load-bearing
  }

  return markProcessed(evt.id);
}

/** Best-effort change-files list. With a GitHub App token we'd fetch the full
 * file list; without, fall back to PR-level totals so the heuristic still has
 * something to chew on. Returns at least one synthetic entry so totalLines is
 * non-zero. */
async function fetchChangedFiles(
  payload: Json,
  _ownerRepo: string,
  _number: number,
  _skillLevel: number | null,
): Promise<ChangedFile[]> {
  // v1: read totals from the webhook payload. The GitHub Files API call comes
  // when we wire installationTokenFor() into a per-PR file fetcher.
  const pr = asObject(payload.pull_request);
  const additions = typeof pr?.additions === "number" ? pr.additions : 0;
  const deletions = typeof pr?.deletions === "number" ? pr.deletions : 0;
  return [{ filename: "__pr-aggregate__", additions, deletions }];
}

// ---------------------------------------------------------------------------
// Outcome assessors — synchronous-on-event paths.
// The cron lookback in `scripts/assess-outcomes.ts` handles the deferred
// 7d / 24h windows; this file only fires the assessors whose verdict is
// knowable on the event itself.
// ---------------------------------------------------------------------------

/** Lookup helper — given a SHA, find the gate_evaluation row whose PR carried it. */
async function findEvaluationByHeadSha(
  organizationId: string,
  projectId: string,
  sha: string,
) {
  const rows = await db
    .select()
    .from(gateEvaluations)
    .where(
      and(
        eq(gateEvaluations.organizationId, organizationId),
        eq(gateEvaluations.projectId, projectId),
      ),
    )
    .orderBy(desc(gateEvaluations.evaluatedAt))
    .limit(200);
  // Match on prefix — `body` typically carries a 7-char short sha, while
  // gate evaluations store the full sha.
  return rows.find((r) => r.prHeadSha && r.prHeadSha.startsWith(sha)) ??
    rows.find((r) => r.prHeadSha === sha) ??
    null;
}

async function runClosedPrAssessors(
  evt: WebhookEvent,
  payload: Json,
  externalKey: string,
  projectId: string,
): Promise<void> {
  if (!evt.organizationId) return markProcessed(evt.id, "webhook has no organizationId");
  const pr = asObject(payload.pull_request);
  if (!pr) return markProcessed(evt.id, "pull_request payload missing");

  const number = typeof pr.number === "number" ? pr.number : Number(pr.number);
  if (!Number.isFinite(number)) return markProcessed(evt.id, "pull_request missing number");

  const ownerRepo = externalKey.replace(/^[^/]+\//, "");
  const prRef = `github:${ownerRepo}#${number}`;
  const sourceRef = prRef;
  const merged = pr.merged === true;
  const mergedAtRaw = asString(pr.merged_at);
  const closedAtRaw = asString(pr.closed_at);
  const createdAtRaw = asString(pr.created_at);
  const mergedAt = mergedAtRaw ? new Date(mergedAtRaw) : null;
  const closedAt = closedAtRaw ? new Date(closedAtRaw) : new Date();
  const createdAt = createdAtRaw ? new Date(createdAtRaw) : new Date(closedAt.getTime() - 1);

  // Path 1 — abandoned (closed without merging).
  if (!merged) {
    const result = assessPrAbandoned({
      merged: false,
      mergedAt: null,
      closed: true,
      closedAt,
      createdAt,
    });
    if (result.verdict !== null) {
      // Skill attribution: look at the most recent gate evaluation for the PR.
      // We don't re-fetch commits — abandoned PRs never produced a head-sha
      // we'd want to charge to a different skill.
      const [evaluation] = await db
        .select({ skillId: gateEvaluations.skillId })
        .from(gateEvaluations)
        .where(
          and(
            eq(gateEvaluations.organizationId, evt.organizationId),
            eq(gateEvaluations.projectId, projectId),
            eq(gateEvaluations.prRef, prRef),
          ),
        )
        .orderBy(desc(gateEvaluations.evaluatedAt))
        .limit(1);
      const skillId = evaluation?.skillId ?? null;
      if (skillId) {
        await recordAssessorOutcome({
          skillId,
          projectId,
          sourceKind: "pr_abandon",
          sourceRef,
          result,
        });
        await recomputeSkillAutonomy(skillId, projectId).catch((err) =>
          console.error("[process-webhook-event] recomputeSkillAutonomy failed:", err),
        );
      }
    }
    return markProcessed(evt.id);
  }

  // Path 2 — merged, revert PR. Attribute the rolled_back outcome to the
  // ORIGINAL skill (the one that produced the reverted change), not the
  // skill that authored the revert itself.
  const prTitle = asString(pr.title) ?? null;
  const prBody = asString(pr.body) ?? null;
  const revert = detectRevert(prTitle, prBody);
  if (!revert) return markProcessed(evt.id);

  let originalEval = null;
  if (revert.originalSha) {
    originalEval = await findEvaluationByHeadSha(evt.organizationId, projectId, revert.originalSha);
  }
  if (!originalEval && revert.originalTitle) {
    // Fall back to title-match on the most-recent evaluation row.
    const [byTitle] = await db
      .select()
      .from(gateEvaluations)
      .where(
        and(
          eq(gateEvaluations.organizationId, evt.organizationId),
          eq(gateEvaluations.projectId, projectId),
          eq(gateEvaluations.prTitle, revert.originalTitle),
        ),
      )
      .orderBy(desc(gateEvaluations.evaluatedAt))
      .limit(1);
    originalEval = byTitle ?? null;
  }
  if (!originalEval || !originalEval.skillId) return markProcessed(evt.id);

  if (!mergedAt) return markProcessed(evt.id);
  const result = assessPrReverted(
    {
      merged: true,
      mergedAt: originalEval.evaluatedAt,
      closed: true,
      closedAt: originalEval.evaluatedAt,
      createdAt: originalEval.evaluatedAt,
    },
    { committedAt: mergedAt, sha: revert.originalSha ?? undefined },
  );
  if (result.verdict !== null) {
    await recordAssessorOutcome({
      skillId: originalEval.skillId,
      projectId,
      sourceKind: "pr_revert",
      sourceRef: originalEval.prRef,
      result,
    });
    await recomputeSkillAutonomy(originalEval.skillId, projectId).catch((err) =>
      console.error("[process-webhook-event] recomputeSkillAutonomy failed:", err),
    );
  }
  return markProcessed(evt.id);
}

interface DeployIncidentInput {
  organizationId: string;
  projectId: string;
  deploymentId: string;
  environment: string;
  completedAt: Date | null;
  rolledBackAt: Date | null;
  status: "failed" | "rolled_back";
  commitSha: string;
  ownerRepo: string;
  installationId: string | null;
}

async function emitDeployIncidentOutcome(input: DeployIncidentInput): Promise<void> {
  const skillSlug = input.installationId
    ? await attributeSkillFromCommitSha(input.commitSha, input.ownerRepo, input.installationId)
    : null;
  if (!skillSlug) return;
  const skill = await db.query.skills.findFirst({
    where: and(eq(skills.organizationId, input.organizationId), eq(skills.slug, skillSlug)),
  });
  if (!skill) return;

  const result = assessDeployIncident(
    {
      status: input.status,
      environment: input.environment,
      completedAt: input.completedAt,
      rolledBackAt: input.rolledBackAt,
    },
    null,
  );
  if (result.verdict === null) return;
  await recordAssessorOutcome({
    skillId: skill.id,
    projectId: input.projectId,
    sourceKind: "deploy_incident",
    sourceRef: `deployment:${input.deploymentId}`,
    result,
  });
  await recomputeSkillAutonomy(skill.id, input.projectId).catch((err) =>
    console.error("[process-webhook-event] recomputeSkillAutonomy failed:", err),
  );
}

function hitsPath(files: ChangedFile[], rule: { tags: string[] | null }): boolean {
  // v1: only treat as "violated" if the rule is tagged with a path hint that
  // appears in a changed file. This is intentionally conservative — false
  // positives on the execution gate are expensive. Real per-rule logic
  // (running the rule body against the diff) is a follow-up.
  const hintTags = (rule.tags ?? []).filter((t) => t.includes("/") || t.endsWith(".ts") || t.endsWith(".py"));
  if (hintTags.length === 0) return false;
  return files.some((f) => hintTags.some((h) => f.filename.includes(h)));
}

// ---------------------------------------------------------------------------
// Jira — issue events → upsert work_items.
//
// Translates `issue_created` / `issue_updated` / `issue_deleted` from the
// Jira webhook into a coznt `work_items` row keyed by `(source, externalId)`.
// The `externalId` is the Jira issue key (ACME-42). Status sync from
// Jira-side transitions arrives via `issue_updated` and updates the row's
// `status`. Coznt's outbound transition uses Jira's transition API; the two
// directions are independent.
// ---------------------------------------------------------------------------

function jiraExternalKey(payload: Json): string | null {
  // Jira sends the project key inside `issue.fields.project.key`.
  const issue = asObject(payload.issue);
  const fields = asObject(issue?.fields);
  const project = asObject(fields?.project);
  return asString(project?.key) ?? null;
}

async function handleJira(evt: WebhookEvent): Promise<void> {
  if (!evt.organizationId) {
    return markProcessed(evt.id, "webhook has no organizationId");
  }
  const payload = asObject(evt.payload) ?? {};
  const externalKey = jiraExternalKey(payload);
  if (!externalKey) {
    return markProcessed(evt.id, "jira payload missing project.key");
  }
  const projectId = await resolveProjectForWebhook(evt.organizationId, "jira", externalKey);
  if (!projectId) {
    return markProcessed(evt.id, `no project binding for jira:${externalKey}`);
  }

  // Only act on issue events for v1. Comment / link events are ignored —
  // they can be added without ceremony when needed.
  const eventName = evt.event;
  if (!eventName || !eventName.startsWith("jira:issue")) {
    return markProcessed(evt.id);
  }

  const issue = asObject(payload.issue);
  const issueKey = asString(issue?.key);
  if (!issue || !issueKey) {
    return markProcessed(evt.id, "jira payload missing issue.key");
  }

  const fields = asObject(issue.fields) ?? {};
  const summary = asString(fields.summary) ?? issueKey;
  const description = asString(fields.description) ?? null;
  const statusObj = asObject(fields.status);
  const status = asString(statusObj?.name) ?? null;
  const typeObj = asObject(fields.issuetype);
  const typeName = (asString(typeObj?.name) ?? "task").toLowerCase();
  const assignee = asObject(fields.assignee);
  const assigneeEmail = asString(assignee?.emailAddress);

  const kind = typeName.includes("epic")
    ? "epic"
    : typeName.includes("bug")
      ? "bug"
      : typeName.includes("story")
        ? "story"
        : "task";

  // Best-effort URL — derive from binding config or fall back to the self
  // link Jira ships with the payload.
  const externalUrl =
    asString(asObject(issue.self) as unknown) ??
    asString(issue.self) ??
    undefined;

  await upsertWorkItem({
    organizationId: evt.organizationId,
    projectId,
    source: "jira",
    externalId: issueKey,
    externalUrl,
    kind,
    title: summary,
    description: description ?? undefined,
    status: status ?? undefined,
    assigneeEmail,
    raw: payload,
  });

  return markProcessed(evt.id);
}

// ---------------------------------------------------------------------------
// Azure DevOps — build/release completion → recordDeployment.
//
// ADO Service Hooks fire `build.complete` and `ms.vss-release.deployment-completed`
// among others. For v1 we treat any terminal build/release as a deployment row
// so DORA + skill autonomy can flow off ADO just like off GitHub.
// ---------------------------------------------------------------------------

function adoExternalKey(payload: Json): string | null {
  // ADO Service Hook payloads put org/project in `resourceContainers`.
  const containers = asObject(payload.resourceContainers);
  const project = asObject(containers?.project);
  const account = asObject(containers?.account);
  const projectName = asString(project?.baseUrl) ?? asString(project?.id);
  const accountName = asString(account?.baseUrl) ?? asString(account?.id);
  return projectName && accountName ? `${accountName}/${projectName}` : null;
}

async function handleADO(evt: WebhookEvent): Promise<void> {
  if (!evt.organizationId) {
    return markProcessed(evt.id, "webhook has no organizationId");
  }
  const payload = asObject(evt.payload) ?? {};
  const externalKey = adoExternalKey(payload);
  if (!externalKey) {
    return markProcessed(evt.id, "ado payload missing resourceContainers");
  }
  const projectId = await resolveProjectForWebhook(evt.organizationId, "ado", externalKey);
  if (!projectId) {
    return markProcessed(evt.id, `no project binding for ado:${externalKey}`);
  }

  const eventName = evt.event ?? "";
  const resource = asObject(payload.resource) ?? {};

  // Build completion: `build.complete`. Treat success as a deployment row.
  if (eventName === "build.complete") {
    const status = asString(resource.status); // "completed" / "inProgress" / ...
    const result = asString(resource.result); // "succeeded" / "failed" / "canceled"
    if (status !== "completed") return markProcessed(evt.id);
    if (result !== "succeeded" && result !== "failed") {
      return markProcessed(evt.id);
    }
    const buildNumber = asString(resource.buildNumber) ?? "unknown";
    const sourceVersion = asString(resource.sourceVersion);
    const sourceBranch = asString(resource.sourceBranch);
    const ciRunUrl = asString(asObject(resource._links)?.web as unknown as string) ??
      asString((asObject(resource._links)?.web as unknown as { href?: string } | null)?.href);
    try {
      await recordDeployment({
        projectId,
        environment: sourceBranch?.includes("release") ? "production" : "build",
        version: buildNumber,
        commitSha: sourceVersion,
        status: result === "succeeded" ? "success" : "failed",
        ciRunUrl: ciRunUrl ?? undefined,
        raw: payload,
        completedAt: new Date(),
      });
      return markProcessed(evt.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return markProcessed(evt.id, `recordDeployment failed: ${msg}`);
    }
  }

  // Release deployment completion: `ms.vss-release.deployment-completed`.
  if (eventName === "ms.vss-release.deployment-completed") {
    const status = asString(resource.status); // "succeeded" / "failed" / ...
    if (status !== "succeeded" && status !== "failed") return markProcessed(evt.id);
    const release = asObject(resource.release) ?? {};
    const environment = asObject(resource.environment) ?? {};
    const envName = asString(environment.name) ?? "production";
    const version = asString(release.name) ?? "unknown";
    try {
      await recordDeployment({
        projectId,
        environment: envName,
        version,
        status: status === "succeeded" ? "success" : "failed",
        raw: payload,
        completedAt: new Date(),
      });
      return markProcessed(evt.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return markProcessed(evt.id, `recordDeployment failed: ${msg}`);
    }
  }

  // Work-item events arrive here too (`workitem.created` / `workitem.updated`).
  // Upsert into work_items so coznt has a row to link plans against.
  if (eventName.startsWith("workitem.")) {
    const id = asString(resource.id) ?? (resource.id != null ? String(resource.id) : null);
    if (!id) return markProcessed(evt.id, "ado workitem payload missing id");
    const fields = asObject(resource.fields) ?? {};
    const title =
      asString(fields["System.Title"]) ?? asString(resource.title) ?? `work item ${id}`;
    const description = asString(fields["System.Description"]) ?? null;
    const state = asString(fields["System.State"]) ?? null;
    const workItemType = (asString(fields["System.WorkItemType"]) ?? "task").toLowerCase();
    const assignedTo = asObject(fields["System.AssignedTo"]);
    const assigneeEmail = asString(assignedTo?.uniqueName);
    const externalUrl = asString(asObject(resource._links)?.html as unknown) ??
      asString((asObject(resource._links)?.html as unknown as { href?: string } | null)?.href);

    const kind = workItemType.includes("epic")
      ? "epic"
      : workItemType.includes("bug")
        ? "bug"
        : workItemType.includes("story") || workItemType.includes("feature")
          ? "story"
          : "task";

    await upsertWorkItem({
      organizationId: evt.organizationId,
      projectId,
      source: "ado",
      externalId: id,
      externalUrl,
      kind,
      title,
      description: description ?? undefined,
      status: state ?? undefined,
      assigneeEmail,
      raw: payload,
    });
    return markProcessed(evt.id);
  }

  return markProcessed(evt.id);
}

// ---------------------------------------------------------------------------
// Confluence — page events → upsert work_items (kind="page").
//
// Confluence's webhooks fire on page create/update/remove. We record the page
// as a coznt `work_item` of kind "page" so audit log + portfolio rollups can
// reference the link. This is the minimum viable surface for the v1 docs flow.
// ---------------------------------------------------------------------------

function confluenceExternalKey(payload: Json): string | null {
  const page = asObject(payload.page);
  const space = asObject(payload.space);
  return asString(page?.spaceKey) ?? asString(space?.key) ?? null;
}

async function handleConfluence(evt: WebhookEvent): Promise<void> {
  if (!evt.organizationId) {
    return markProcessed(evt.id, "webhook has no organizationId");
  }
  const payload = asObject(evt.payload) ?? {};
  const externalKey = confluenceExternalKey(payload);
  if (!externalKey) {
    return markProcessed(evt.id, "confluence payload missing space key");
  }
  const projectId = await resolveProjectForWebhook(
    evt.organizationId,
    "confluence",
    externalKey,
  );
  if (!projectId) {
    return markProcessed(evt.id, `no project binding for confluence:${externalKey}`);
  }

  const eventName = evt.event ?? "";
  if (!eventName.startsWith("page_")) {
    return markProcessed(evt.id);
  }

  const page = asObject(payload.page);
  const pageId = asString(page?.id) ?? (page?.id != null ? String(page.id) : null);
  if (!pageId) return markProcessed(evt.id, "confluence payload missing page.id");

  const title = asString(page?.title) ?? `page ${pageId}`;
  const version = asObject(page?.version);
  const versionNumber = typeof version?.number === "number" ? version.number : null;
  const status = eventName === "page_removed" ? "Removed" : `Published v${versionNumber ?? 1}`;
  const baseUrl = asString(page?.self);
  const externalUrl = baseUrl ?? undefined;

  await upsertWorkItem({
    organizationId: evt.organizationId,
    projectId,
    source: "confluence",
    externalId: pageId,
    externalUrl,
    kind: "page",
    title,
    status,
    raw: payload,
  });

  return markProcessed(evt.id);
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

import type { TaskParams } from "@/lib/rules";

/**
 * Worker-facing entrypoint. The rules engine passes a `TaskParams` carrying
 * the webhook_events row id. We fetch the row and dispatch to per-source
 * handlers. `_dispatch` is exported for tests / direct calls.
 */
export async function processWebhookEvent(params: TaskParams): Promise<void> {
  const [evt] = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.id, params.entityId))
    .limit(1);
  if (!evt || evt.processedAt) return;
  await dispatchWebhookEvent(evt);
}

export async function dispatchWebhookEvent(evt: WebhookEvent): Promise<void> {
  try {
    switch (evt.source) {
      case "github":
        return await handleGitHub(evt);
      case "jira":
        return await handleJira(evt);
      case "ado":
        return await handleADO(evt);
      case "confluence":
        return await handleConfluence(evt);
      default:
        return await markProcessed(evt.id, `unknown source: ${evt.source}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markProcessed(evt.id, msg);
  }
}
