/**
 * processWebhookEvent — fired by webhook_events.insert.
 *
 * Loads the raw event, dispatches by source, then marks it processed.
 * Source-specific handlers go in `./webhooks/<source>.ts`. Unknown
 * events are still marked processed so the table doesn't grow forever.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { webhookEvents } from "@/db/schema/webhook-event";
import type { TaskParams } from "@/lib/rules";

export async function processWebhookEvent(params: TaskParams): Promise<void> {
  const [row] = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.id, params.entityId))
    .limit(1);
  if (!row || row.processedAt) return;

  try {
    if (row.source === "github") {
      await handleGitHub(row.organizationId ?? params.organizationId, row.event, row.payload);
    }
    // jira / ado / confluence handlers land here as we wire them up.

    await db
      .update(webhookEvents)
      .set({ processedAt: new Date(), processingError: null })
      .where(eq(webhookEvents.id, row.id));
  } catch (err) {
    await db
      .update(webhookEvents)
      .set({
        processedAt: new Date(),
        processingError: err instanceof Error ? err.message : String(err),
      })
      .where(eq(webhookEvents.id, row.id));
    throw err;
  }
}

async function handleGitHub(orgId: string, event: string, payload: unknown): Promise<void> {
  if (event !== "deployment_status") return;
  const p = payload as {
    deployment_status?: { state?: string; environment?: string };
    deployment?: { sha?: string; ref?: string; environment?: string };
    repository?: { full_name?: string; id?: number };
  };
  const state = p.deployment_status?.state;
  if (state !== "success" && state !== "failure") return;

  // The CI pipeline knows its dilliznt projectId. We expect it embedded in the
  // deployment description or env. Without it we can't write a deployment row,
  // so skip silently — the raw payload is still in webhook_events for inspection.
  // (Wiring projectId discovery is a follow-up; cf. TODO.)
  void orgId;
  void p;
}
