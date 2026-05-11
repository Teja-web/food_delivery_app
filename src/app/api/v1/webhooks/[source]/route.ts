/**
 * POST /api/v1/webhooks/:source
 *
 * Inbound webhook receiver. Auth is the standard `/api/v1` bearer token —
 * the integrating CI/system gets an API key from `/api-keys` and POSTs here.
 * Per-source signature verification (GitHub HMAC, etc.) is a follow-up.
 *
 * The route is intentionally thin: it dedupes on `(source, externalId)`
 * and inserts into `webhook_events`. The PG trigger fires `webhook_event:insert`
 * which the worker drains via `processWebhookEvent`.
 */

import { handleApi } from "@/lib/api/auth";
import { db } from "@/db/client";
import { webhookEvents, WEBHOOK_SOURCES, type WebhookSource } from "@/db/schema/webhook-event";
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

export async function POST(req: Request, { params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  if (!WEBHOOK_SOURCES.includes(source as WebhookSource)) {
    return Response.json({ error: `Unknown source '${source}'` }, { status: 400 });
  }
  const src = source as WebhookSource;

  return handleApi(req, async (ctx) => {
    const payload = await req.json();
    const event =
      readHeader(req, EVENT_HEADERS[src]) ??
      (typeof (payload as { event?: unknown })?.event === "string"
        ? (payload as { event: string }).event
        : "unknown");
    const externalId = readHeader(req, DELIVERY_HEADERS[src]) ?? nanoid();

    try {
      const [row] = await db
        .insert(webhookEvents)
        .values({
          organizationId: ctx.organizationId,
          source: src,
          externalId,
          event,
          payload,
        })
        .returning({ id: webhookEvents.id });
      return { id: row.id, status: "queued" };
    } catch (err) {
      // Unique violation on (source, external_id) → idempotent ack.
      if (err instanceof Error && /webhook_events_source_external_unique/.test(err.message)) {
        return { status: "duplicate", externalId };
      }
      throw err;
    }
  });
}
