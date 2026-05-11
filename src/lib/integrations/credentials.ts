/**
 * Integration credentials — load + decrypt org-scoped credentials.
 *
 * Source of truth: `integration_credentials` (one row per org+provider).
 * Secrets are AES-256-GCM encrypted at rest via `./encryption.ts`.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { integrationCredentials } from "@/db/schema/integrations";
import { decrypt } from "./encryption";

export type IntegrationProvider = "github" | "jira" | "ado" | "confluence";

export interface DecryptedCredentials {
  provider: IntegrationProvider;
  clientId?: string;
  clientSecret?: string;
  apiKey?: string;
  config: Record<string, string>;
}

export class MissingIntegrationError extends Error {
  status = 404;
  constructor(provider: IntegrationProvider, organizationId: string) {
    super(`No '${provider}' integration configured for org ${organizationId}`);
    this.name = "MissingIntegrationError";
  }
}

export async function loadCredentials(
  organizationId: string,
  provider: IntegrationProvider,
): Promise<DecryptedCredentials> {
  const [row] = await db
    .select()
    .from(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.organizationId, organizationId),
        eq(integrationCredentials.provider, provider),
      ),
    )
    .limit(1);

  if (!row) throw new MissingIntegrationError(provider, organizationId);

  return {
    provider,
    clientId: row.clientIdEncrypted ? decrypt(row.clientIdEncrypted) : undefined,
    clientSecret: row.clientSecretEncrypted ? decrypt(row.clientSecretEncrypted) : undefined,
    apiKey: row.apiKeyEncrypted ? decrypt(row.apiKeyEncrypted) : undefined,
    config: row.config ?? {},
  };
}
