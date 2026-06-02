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
import { webhookEvents, WEBHOOK_SOURCES, type WebhookSource } from "@/db/schema/audit/webhook-event";
import {
  GITHUB_SIGNATURE_HEADER,
  resolveOrgFromInstallation,
  resolveOrgFromRepo,
  verifyGithubSignature,
} from "@/lib/integrations/github-webhook-hmac";
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

function readHeader(req: Request, names: string[]): string | undefined {
  for (const n of names) {
    const v = req.headers.get(n);
    if (v) return v;
  }
  return undefined;
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

    // App deliveries: resolve via installation.id. Repo/org-level webhooks
    // (no App installed): fall back to repository.full_name against
    // adapter_bindings so the integrator just needs a binding row, not an App.
    let orgId: string | null = null;
    if (installationId) {
      orgId = await resolveOrgFromInstallation(installationId);
    } else {
      const repo =
        payload.repository && typeof payload.repository === "object"
          ? (payload.repository as { full_name?: string; html_url?: string })
          : null;
      const fullName = typeof repo?.full_name === "string" ? repo.full_name : null;
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

  // Bearer-token path: legacy integrations that paste an API key.
  try {
    const ctx = await authenticate(req);
    return withApiContext(ctx, async () => {
      const payload = await req.json();
      const event =
        readHeader(req, EVENT_HEADERS[src]) ??
        (typeof (payload as { event?: unknown })?.event === "string"
          ? (payload as { event: string }).event
          : "unknown");
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
