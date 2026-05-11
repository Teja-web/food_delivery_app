/**
 * Webhook event processor — runs in the worker against rows written by the
 * `/api/v1/webhooks/[source]` ingest endpoint.
 *
 * For each unprocessed `webhook_events` row we:
 *   1. Derive an `externalKey` from the payload (provider-specific).
 *   2. Resolve it to a dilliznt projectId via the AdapterBinding table.
 *   3. Fan out to a per-source handler (e.g. GitHub deployment_status →
 *      `recordDeployment`).
 *   4. Mark `processedAt`, or set `processingError` and leave for triage.
 *
 * AdapterBinding (see `src/db/schema/adapter-binding.ts`) is what lets us
 * map "this GitHub repo" → "this dilliznt project" without hard-coding it
 * in the payload.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { webhookEvents, type WebhookEvent } from "@/db/schema/webhook-event";
import { resolveProjectForWebhook } from "@/lib/integrations/resolve";
import { recordDeployment } from "@/operations/deployments";

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

  // Other GitHub events resolved to a project but aren't yet wired up.
  // TODO: implement per-event handlers (push, pull_request, check_run, …).
  return markProcessed(evt.id);
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

export async function processWebhookEvent(evt: WebhookEvent): Promise<void> {
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
