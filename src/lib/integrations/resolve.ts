/**
 * Resolve an external (webhook) entity to the dilliznt project it belongs to.
 *
 * The webhook ingest path stores every event in `webhook_events` keyed by
 * `(source, externalId)` for idempotency. The processor task then has to
 * figure out which dilliznt `projectId` the event applies to — that's what
 * this resolver does, via the `adapter_bindings` table.
 */

import type { WebhookSource } from "@/db/schema/webhook-event";
import type { AdapterProvider } from "@/db/schema/adapter-binding";
import { findProjectIdForBinding } from "@/operations/adapter-bindings";

/**
 * Webhook source slugs and AdapterBinding provider slugs are kept in sync
 * (both are `github` / `jira` / `ado` / `confluence`). This identity cast
 * documents that contract.
 */
function sourceToProvider(source: WebhookSource): AdapterProvider {
  return source;
}

/**
 * Returns the dilliznt projectId bound to `(organizationId, source, externalKey)`,
 * or null if no binding exists.
 *
 * `externalKey` format per source — see `src/db/schema/adapter-binding.ts`:
 *   - `github`     → `host/owner/repo`     (e.g. `github.com/acme/api`)
 *   - `jira`       → Jira project key      (e.g. `ACME`)
 *   - `ado`        → `organization/project` (e.g. `acme-org/api`)
 *   - `confluence` → space key             (e.g. `ENG`)
 */
export async function resolveProjectForWebhook(
  organizationId: string,
  source: WebhookSource,
  externalKey: string,
): Promise<string | null> {
  if (!organizationId || !externalKey) return null;
  return findProjectIdForBinding(organizationId, sourceToProvider(source), externalKey);
}
