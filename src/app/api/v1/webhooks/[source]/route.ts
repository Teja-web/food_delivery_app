/**
 * POST /api/v1/webhooks/:source
 *
 * Inbound webhook receiver. Two auth paths coexist:
 *
 *   1. Bearer token   — the integrator pastes a coznt API key into GitHub.
 *                       Org context is the api key's org.
 *   2. HMAC signature — GitHub App deliveries. Verified against
 *                       COZNT_GITHUB_WEBHOOK_SECRET; org resolved from the
 *                       installation id on the payload.
 *
 * The route is intentionally thin: it dedupes on `(source, externalId)`
 * and inserts into `webhook_events`. The PG trigger fires `webhook_event:insert`
 * which the worker drains via `processWebhookEvent`.
 */

import { authenticate, UnauthorizedError, withApiContext } from "@/lib/api/auth";
import { db } from "@/db/client";
import { webhookEvents, WEBHOOK_SOURCES, type WebhookSource } from "@/db/schema/webhook-event";
import {
  GITHUB_SIGNATURE_HEADER,
  resolveOrgFromInstallation,
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
    if (!installationId) {
      return Response.json(
        { error: "Signed webhook missing installation id" },
        { status: 400 },
      );
    }
    const orgId = await resolveOrgFromInstallation(installationId);
    if (!orgId) {
      // Honest 404: we don't have a binding for this installation. Drop
      // silently from the App's perspective by returning success — replay
      // would just be noise.
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
