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

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvals } from "@/db/schema/approval";
import { projects } from "@/db/schema/project";
import { rules } from "@/db/schema/rule";
import { skills } from "@/db/schema/skill";
import { webhookEvents, type WebhookEvent } from "@/db/schema/webhook-event";
import { isConfigured as githubAppConfigured, postCheckRun } from "@/lib/integrations/github-app";
import { resolveProjectForWebhook } from "@/lib/integrations/resolve";
import { attributeSkill } from "@/lib/integrations/skill-attribution";
import { classifyChangeRisk, type ChangedFile } from "@/operations/change-risk";
import { recordDeployment } from "@/operations/deployments";
import { evaluatePullRequest, type GateInput } from "@/operations/execution-gate";
import { getSkillAutonomy } from "@/operations/skill-autonomy";

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
      await recordDeployment({
        projectId,
        environment,
        version,
        commitSha,
        status: state === "success" ? "success" : "failed",
        ciRunUrl,
        raw: payload,
        completedAt: new Date(),
      });
      return markProcessed(evt.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return markProcessed(evt.id, `recordDeployment failed: ${msg}`);
    }
  }

  if (evt.event === "pull_request") {
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
// Jira / ADO / Confluence — stubs
// ---------------------------------------------------------------------------

async function handleSourceStub(
  evt: WebhookEvent,
  externalKey: string | null,
): Promise<void> {
  if (!evt.organizationId) {
    return markProcessed(evt.id, "webhook has no organizationId");
  }
  if (!externalKey) {
    return markProcessed(evt.id, `${evt.source} payload missing external key`);
  }
  const projectId = await resolveProjectForWebhook(
    evt.organizationId,
    evt.source,
    externalKey,
  );
  if (!projectId) {
    return markProcessed(evt.id, `no project binding for ${externalKey}`);
  }
  // TODO: implement per-source handler (issues → work items, deploys → deployments).
  return markProcessed(evt.id);
}

function jiraExternalKey(payload: Json): string | null {
  // Jira sends the project key inside `issue.fields.project.key`.
  const issue = asObject(payload.issue);
  const fields = asObject(issue?.fields);
  const project = asObject(fields?.project);
  return asString(project?.key) ?? null;
}

function adoExternalKey(payload: Json): string | null {
  // ADO Service Hook payloads put org/project in `resourceContainers`.
  const containers = asObject(payload.resourceContainers);
  const project = asObject(containers?.project);
  const account = asObject(containers?.account);
  const projectName = asString(project?.baseUrl) ?? asString(project?.id);
  const accountName = asString(account?.baseUrl) ?? asString(account?.id);
  return projectName && accountName ? `${accountName}/${projectName}` : null;
}

function confluenceExternalKey(payload: Json): string | null {
  // Confluence webhook page events include `page.spaceKey` or `space.key`.
  const page = asObject(payload.page);
  const space = asObject(payload.space);
  return asString(page?.spaceKey) ?? asString(space?.key) ?? null;
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
        return await handleSourceStub(evt, jiraExternalKey(asObject(evt.payload) ?? {}));
      case "ado":
        return await handleSourceStub(evt, adoExternalKey(asObject(evt.payload) ?? {}));
      case "confluence":
        return await handleSourceStub(
          evt,
          confluenceExternalKey(asObject(evt.payload) ?? {}),
        );
      default:
        return await markProcessed(evt.id, `unknown source: ${evt.source}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markProcessed(evt.id, msg);
  }
}
