/**
 * POST /api/v1/webhooks/:source
 *
 * Inbound webhook receiver. Two auth paths coexist:
 *
 *   1. Bearer token   — the integrator pastes a coznt API key into the
 *                       webhook headers. Org context is the API key's org.
 *   2. HMAC signature — verified against COZNT_GITHUB_WEBHOOK_SECRET.
 *                       Org resolution tries `installation.id` first (App
 *                       deliveries), then falls back to `repository.full_name`
 *                       against `adapter_bindings` so plain repo/org-level
 *                       webhooks work without a GitHub App install.
 *
 * The route is intentionally thin: it dedupes on `(source, externalId)`
 * and inserts into `webhook_events`. The PG trigger fires `webhook_event:insert`
 * which the worker drains via `processWebhookEvent`.
 */

import { authenticate, UnauthorizedError, withApiContext } from "@/lib/auth/api-key";
import { db } from "@/db/client";
import { adapterBindings } from "@/db/schema/adapter-binding";
import { webhookEvents, WEBHOOK_SOURCES, type WebhookSource } from "@/db/schema/audit/webhook-event";
import { and, eq, sql } from "drizzle-orm";
import {
  GITHUB_SIGNATURE_HEADER,
  resolveOrgFromInstallation,
  resolveOrgFromRepo,
  verifyGithubSignature,
} from "@/lib/integrations/github-webhook-hmac";
import {
  JIRA_SIGNATURE_HEADERS,
  verifyJiraSignature,
} from "@/lib/integrations/jira-webhook-hmac";
import {
  jiraExternalKeyLookupCandidates,
} from "@/lib/integrations/jira-keys";
import { nanoid } from "nanoid";

const EVENT_HEADERS: Record<WebhookSource, string[]> = {
  github: ["x-github-event"],
  jira: ["x-atlassian-webhook-event"],
  ado: ["x-vss-eventtype"],
  confluence: ["x-atlassian-webhook-event"],
};

const DELIVERY_HEADERS: Record<WebhookSource, string[]> = {
  github: ["x-github-delivery"],
  jira: ["x-atlassian-webhook-identifier"],
  ado: ["x-request-id"],
  confluence: ["x-atlassian-webhook-identifier"],
};

const WEBHOOK_API_KEY_HEADERS = ["x-coznt-api-key", "x-api-key"];

function readHeader(req: Request, names: string[]): string | undefined {
  for (const n of names) {
    const v = req.headers.get(n);
    if (v) return v;
  }
  return undefined;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function webhookEventFromPayload(payload: Record<string, unknown>): string | undefined {
  return asString(payload.event) ?? asString(payload.webhookEvent);
}

function jiraWebhookEventName(req: Request, payload: Record<string, unknown>): string {
  return readHeader(req, EVENT_HEADERS.jira) ?? asString(payload.webhookEvent) ?? "unknown";
}

function normalizeApiKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const bearer = trimmed.match(/^Bearer\s+(.+)$/i);
  return bearer ? bearer[1].trim() : trimmed;
}

export function readWebhookApiKey(req: Request): string | null {
  for (const header of WEBHOOK_API_KEY_HEADERS) {
    const token = normalizeApiKey(req.headers.get(header));
    if (token) return token;
  }

  return null;
}

async function authenticateWebhook(req: Request) {
  try {
    return await authenticate(req);
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) throw err;

    const token = readWebhookApiKey(req);
    if (!token) throw err;

    const headers = new Headers(req.headers);
    headers.set("authorization", `Bearer ${token}`);
    return authenticate(new Request(req.url, { method: req.method, headers }));
  }
}

/** Extract host from a GitHub repo URL so GHE webhooks resolve to the right
 * adapter_binding (which stores externalKey as `<host>/<owner>/<repo>`). */
function hostFromHtmlUrl(htmlUrl: string | undefined): string | null {
  if (!htmlUrl) return null;
  try {
    return new URL(htmlUrl).host;
  } catch {
    return null;
  }
}

export function jiraProjectKeyFromPayload(payload: Record<string, unknown>): string | null {
  const issue = asObject(payload.issue);
  const fields = asObject(issue?.fields);
  const project = asObject(fields?.project) ?? asObject(payload.project);
  return asString(project?.key)?.trim().toUpperCase() ?? null;
}

function jiraSiteUrlFromPayload(payload: Record<string, unknown>): string | null {
  const issue = asObject(payload.issue);
  const fields = asObject(issue?.fields);
  const project = asObject(fields?.project) ?? asObject(payload.project);
  return asString(issue?.self) ?? asString(project?.self) ?? null;
}

async function resolveOrgFromJiraPayload(
  payload: Record<string, unknown>,
  organizationHint?: string | null,
): Promise<
  | { status: "ok"; organizationId: string }
  | { status: "missing-project-key" }
  | { status: "no-binding"; projectKey: string }
  | { status: "ambiguous-binding"; projectKey: string }
> {
  const projectKey = jiraProjectKeyFromPayload(payload);
  if (!projectKey) return { status: "missing-project-key" };
  const siteUrl = jiraSiteUrlFromPayload(payload);
  const candidates = jiraExternalKeyLookupCandidates(projectKey, siteUrl);

  for (const candidate of candidates) {
    const rows = await db
      .select({ organizationId: adapterBindings.organizationId })
      .from(adapterBindings)
      .where(
        and(
          eq(adapterBindings.provider, "jira"),
          sql`lower(${adapterBindings.externalKey}) = ${candidate.toLowerCase()}`,
          organizationHint ? eq(adapterBindings.organizationId, organizationHint) : undefined,
        ),
      )
      .limit(2);

    if (rows.length === 0) continue;
    const organizationIds = [...new Set(rows.map((row) => row.organizationId))];
    if (organizationIds.length > 1) return { status: "ambiguous-binding", projectKey };
    return { status: "ok", organizationId: organizationIds[0] };
  }

  return { status: "no-binding", projectKey };
}

interface InsertParams {
  organizationId: string;
  source: WebhookSource;
  externalId: string;
  event: string;
  payload: unknown;
}

async function insertWebhookEvent({
  organizationId,
  source,
  externalId,
  event,
  payload,
}: InsertParams) {
  try {
    const [row] = await db
      .insert(webhookEvents)
      .values({ organizationId, source, externalId, event, payload: payload as object })
      .returning({ id: webhookEvents.id });
    return Response.json({ id: row.id, status: "queued" });
  } catch (err) {
    if (err instanceof Error && /webhook_events_source_external_unique/.test(err.message)) {
      return Response.json({ status: "duplicate", externalId });
    }
    throw err;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  if (!WEBHOOK_SOURCES.includes(source as WebhookSource)) {
    return Response.json({ error: `Unknown source '${source}'` }, { status: 400 });
  }
  const src = source as WebhookSource;

  const signature = req.headers.get(GITHUB_SIGNATURE_HEADER);

  // GitHub App path: HMAC over the raw body. We must read the body as
  // text first so the signature check operates on the exact bytes
  // GitHub signed (re-stringifying parsed JSON would lose ordering).
  if (src === "github" && signature) {
    const raw = await req.text();
    const result = verifyGithubSignature(raw, signature);
    if (!result.ok) {
      return Response.json(
        { error: "Invalid webhook signature", reason: result.reason },
        { status: 401 },
      );
    }
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const installation =
      payload.installation && typeof payload.installation === "object"
        ? (payload.installation as { id?: number | string })
        : null;
    const installationId = installation?.id != null ? String(installation.id) : null;

    const repo =
      payload.repository && typeof payload.repository === "object"
        ? (payload.repository as { full_name?: string; html_url?: string })
        : null;
    const fullName = typeof repo?.full_name === "string" ? repo.full_name : null;

    // App deliveries: prefer installation.id, but fall back to the repo
    // binding when the app install has not been written into adapter config.
    // Repo/org-level webhooks also resolve through repository.full_name.
    let orgId: string | null = null;
    if (installationId) {
      orgId = await resolveOrgFromInstallation(installationId);
    }
    if (!orgId) {
      if (fullName) {
        const host = hostFromHtmlUrl(repo?.html_url) ?? "github.com";
        orgId = await resolveOrgFromRepo(fullName, host);
      }
    }
    if (!orgId) {
      // No binding: drop silently. Replaying would just be noise. This covers
      // both unknown installations and unbound repos (incl. App meta events
      // like `github_app_authorization` that legitimately omit installation).
      return Response.json({ status: "no-binding" });
    }
    const event = readHeader(req, EVENT_HEADERS.github) ?? "unknown";
    const externalId = readHeader(req, DELIVERY_HEADERS.github) ?? nanoid();
    return insertWebhookEvent({
      organizationId: orgId,
      source: "github",
      externalId,
      event,
      payload,
    });
  }

  const jiraSignature = readHeader(req, [...JIRA_SIGNATURE_HEADERS]);
  if (src === "jira" && jiraSignature) {
    const raw = await req.text();
    const result = verifyJiraSignature(raw, jiraSignature);
    if (!result.ok) {
      return Response.json(
        { error: "Invalid webhook signature", reason: result.reason },
        { status: 401 },
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const orgResolution = await resolveOrgFromJiraPayload(
      payload,
      new URL(req.url).searchParams.get("orgId"),
    );
    if (orgResolution.status === "missing-project-key") {
      return Response.json({ error: "Jira webhook payload missing project key" }, { status: 400 });
    }
    if (orgResolution.status === "no-binding") {
      return Response.json({ status: "no-binding", projectKey: orgResolution.projectKey });
    }
    if (orgResolution.status === "ambiguous-binding") {
      return Response.json(
        {
          error: "Multiple organizations are bound to this Jira project key. Add ?orgId=<organizationId> to the webhook URL.",
          projectKey: orgResolution.projectKey,
        },
        { status: 409 },
      );
    }

    const event = jiraWebhookEventName(req, payload);
    const externalId = readHeader(req, DELIVERY_HEADERS.jira) ?? nanoid();
    return insertWebhookEvent({
      organizationId: orgResolution.organizationId,
      source: "jira",
      externalId,
      event,
      payload,
    });
  }

  // API-key path: Authorization plus webhook-provider-friendly headers
  // for providers that cannot set Authorization.
  try {
    const ctx = await authenticateWebhook(req);
    return withApiContext(ctx, async () => {
      const payload = await req.json();
      const event =
        readHeader(req, EVENT_HEADERS[src]) ??
        webhookEventFromPayload(payload as Record<string, unknown>) ??
        "unknown";
      const externalId = readHeader(req, DELIVERY_HEADERS[src]) ?? nanoid();
      return insertWebhookEvent({
        organizationId: ctx.organizationId,
        source: src,
        externalId,
        event,
        payload,
      });
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return Response.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : "Internal error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
