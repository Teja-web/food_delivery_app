/**
 * Domain event emitter — append-only to `coznt.events` + in-process pub/sub.
 *
 * Best-effort. Failures are logged but never thrown back at the caller — a
 * stuck event write must not roll back a recorded outcome or a gate verdict.
 * The events table feeds the SSE stream and the marketing-grade activity
 * ledger; callers should treat it as a side-effect, not a contract.
 */

import { db } from "@/db/client";
import { events } from "@/db/schema/audit/event";
import { eventBus } from "./bus";

export interface DomainEventInput {
  organizationId: string;
  kind: string;
  summary?: string;
  actorId?: string | null;
  entityType?: string;
  entityId?: string | null;
  payload?: Record<string, unknown>;
}

export async function emitDomainEvent(input: DomainEventInput): Promise<void> {
  try {
    await db.insert(events).values({
      organizationId: input.organizationId,
      kind: input.kind,
      summary: input.summary ?? null,
      actorId: input.actorId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      payload: input.payload ?? null,
    });
    eventBus.publish({
      type: input.kind,
      payload: {
        entityType: input.entityType ?? "",
        operation: input.kind,
        entityId: input.entityId ?? "",
        organizationId: input.organizationId,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[emitDomainEvent] failed:", err, { kind: input.kind, entityId: input.entityId });
  }
}

/**
 * Map a `(sourceKind, verdict)` pair from `skill_outcomes` to a marketing-grade
 * event `kind`. Returns null for combinations that should not surface on the
 * activity ledger (e.g. signal-only rows with no verdict).
 */
export function eventKindForOutcome(
  sourceKind: string | null,
  verdict: string | null,
): string | null {
  if (verdict === null) return null;
  switch (sourceKind) {
    case "pr_merge":
      return verdict === "success" ? "pr.merge" : null;
    case "pr_revert":
      return verdict === "rolled_back" ? "pr.revert" : null;
    case "pr_abandon":
      return verdict === "rolled_back" ? "pr.abandon" : null;
    case "deploy_clean":
      return verdict === "success" ? "deploy.clean" : null;
    case "deploy_incident":
      return verdict === "incident" ? "deploy.incident" : null;
    case "invocation":
    case null:
      if (verdict === "success") return "outcome.success";
      if (verdict === "incident") return "outcome.incident";
      if (verdict === "rolled_back") return "outcome.rollback";
      return null;
    default:
      return null;
  }
}
