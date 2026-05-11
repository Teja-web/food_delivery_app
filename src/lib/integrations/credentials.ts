/**
 * Three-tier credential resolution for integration providers.
 *
 * Resolution order:
 *   1. Organization DB (integration_credentials table)
 *   2. Platform defaults (.env — only Google & Microsoft)
 *   3. CredentialsNotConfiguredError
 *
 * This module is the single source of truth for "where do I get
 * client credentials for provider X in org Y?"
 */

import { db } from "@/db/client";
import { integrationCredentials } from "@/db/schema/integrations";
import { eq, and, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { encrypt, decrypt } from "./encryption";

// -- Types ----------------------------------------------------------------

export type OAuthCredentials = {
  type: "oauth";
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type APIKeyCredentials = {
  type: "api_key";
  apiKey: string;
  config: Record<string, string>;
};

export type ProviderCredentials = OAuthCredentials | APIKeyCredentials;

export type CredentialStatus = {
  configured: boolean;
  source: "org" | "platform" | "none";
};

export class CredentialsNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`Credentials not configured for provider "${provider}". An organization admin must configure this integration before it can be used.`);
    this.name = "CredentialsNotConfiguredError";
  }
}

// -- Platform defaults (env vars) -----------------------------------------

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3029";

const PLATFORM_DEFAULTS: Record<string, {
  clientIdEnv: string;
  clientSecretEnv: string;
  redirectPath: string;
}> = {
  "google-calendar": {
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    redirectPath: "/api/calendar/callback",
  },
  "google-email": {
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    redirectPath: "/api/email/callback",
  },
  "outlook-calendar": {
    clientIdEnv: "MICROSOFT_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_CLIENT_SECRET",
    redirectPath: "/api/calendar/callback",
  },
  "outlook-email": {
    clientIdEnv: "MICROSOFT_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_CLIENT_SECRET",
    redirectPath: "/api/email/callback",
  },
};

// Redirect paths for ATS/HRIS OAuth providers (no platform default, but need path)
const OAUTH_REDIRECT_PATHS: Record<string, string> = {
  lever: "/api/ats/callback",
  workable: "/api/ats/callback",
  workday: "/api/hris/callback",
  gusto: "/api/hris/callback",
};

function getPlatformCredentials(provider: string): OAuthCredentials | null {
  const defaults = PLATFORM_DEFAULTS[provider];
  if (!defaults) return null;

  const clientId = process.env[defaults.clientIdEnv];
  const clientSecret = process.env[defaults.clientSecretEnv];
  if (!clientId || !clientSecret) return null;

  return {
    type: "oauth",
    clientId,
    clientSecret,
    redirectUri: `${APP_URL()}${defaults.redirectPath}`,
  };
}

// -- Core resolution ------------------------------------------------------

/**
 * Resolve credentials for a provider in an organization.
 * Checks org DB first, then platform defaults.
 * Throws CredentialsNotConfiguredError if neither exists.
 */
export async function getProviderCredentials(
  orgId: string,
  provider: string,
): Promise<ProviderCredentials> {
  // 1. Check org-level credentials
  const [row] = await db
    .select()
    .from(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.organizationId, orgId),
        eq(integrationCredentials.provider, provider),
      )
    )
    .limit(1);

  if (row) {
    if (row.apiKeyEncrypted) {
      return {
        type: "api_key",
        apiKey: decrypt(row.apiKeyEncrypted),
        config: (row.config as Record<string, string>) ?? {},
      };
    }

    if (row.clientIdEncrypted && row.clientSecretEncrypted) {
      const redirectPath = OAUTH_REDIRECT_PATHS[provider] ?? PLATFORM_DEFAULTS[provider]?.redirectPath ?? "";
      const configRedirectUri = (row.config as Record<string, string>)?.redirectUri;

      return {
        type: "oauth",
        clientId: decrypt(row.clientIdEncrypted),
        clientSecret: decrypt(row.clientSecretEncrypted),
        redirectUri: configRedirectUri ?? `${APP_URL()}${redirectPath}`,
      };
    }
  }

  // 2. Check platform defaults
  const platformCreds = getPlatformCredentials(provider);
  if (platformCreds) return platformCreds;

  // 3. Nothing found
  throw new CredentialsNotConfiguredError(provider);
}

/**
 * Non-throwing check: does this provider have credentials configured?
 */
export async function hasProviderCredentials(
  orgId: string,
  provider: string,
): Promise<boolean> {
  try {
    await getProviderCredentials(orgId, provider);
    return true;
  } catch {
    return false;
  }
}

// -- Batch status check (for settings page) -------------------------------

/**
 * Check credential status for multiple providers at once.
 * Returns a map of provider → { configured, source }.
 */
export async function getOrgCredentialStatuses(
  orgId: string,
  providers: string[],
): Promise<Record<string, CredentialStatus>> {
  // Batch query org credentials
  const orgRows = providers.length > 0
    ? await db
        .select({
          provider: integrationCredentials.provider,
          hasApiKey: integrationCredentials.apiKeyEncrypted,
          hasClientId: integrationCredentials.clientIdEncrypted,
        })
        .from(integrationCredentials)
        .where(
          and(
            eq(integrationCredentials.organizationId, orgId),
            inArray(integrationCredentials.provider, providers),
          )
        )
    : [];

  const orgConfigured = new Set(
    orgRows
      .filter((r) => r.hasApiKey || r.hasClientId)
      .map((r) => r.provider)
  );

  const result: Record<string, CredentialStatus> = {};
  for (const provider of providers) {
    if (orgConfigured.has(provider)) {
      result[provider] = { configured: true, source: "org" };
    } else if (PLATFORM_DEFAULTS[provider]) {
      const platformCreds = getPlatformCredentials(provider);
      result[provider] = platformCreds
        ? { configured: true, source: "platform" }
        : { configured: false, source: "none" };
    } else {
      result[provider] = { configured: false, source: "none" };
    }
  }

  return result;
}

// -- CRUD for org credentials ---------------------------------------------

/**
 * Save (upsert) organization credentials for a provider.
 */
export async function saveOrgCredentials(
  orgId: string,
  provider: string,
  category: string,
  data: {
    clientId?: string;
    clientSecret?: string;
    apiKey?: string;
    config?: Record<string, string>;
  },
  configuredBy: string,
): Promise<string> {
  const now = new Date().toISOString();

  const values = {
    organizationId: orgId,
    provider,
    category,
    clientIdEncrypted: data.clientId ? encrypt(data.clientId) : null,
    clientSecretEncrypted: data.clientSecret ? encrypt(data.clientSecret) : null,
    apiKeyEncrypted: data.apiKey ? encrypt(data.apiKey) : null,
    config: data.config ?? null,
    configuredBy,
    updatedAt: now,
  };

  // Check for existing row
  const [existing] = await db
    .select({ id: integrationCredentials.id })
    .from(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.organizationId, orgId),
        eq(integrationCredentials.provider, provider),
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(integrationCredentials)
      .set(values)
      .where(eq(integrationCredentials.id, existing.id));
    return existing.id;
  }

  const id = nanoid();
  await db.insert(integrationCredentials).values({
    id,
    ...values,
    createdAt: now,
  });
  return id;
}

/**
 * Remove organization credentials for a provider.
 */
export async function removeOrgCredentials(
  orgId: string,
  provider: string,
): Promise<void> {
  await db
    .delete(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.organizationId, orgId),
        eq(integrationCredentials.provider, provider),
      )
    );
}

/**
 * Get the integration_credentials row ID for a provider (used as connectionId for API key providers).
 */
export async function getOrgCredentialId(
  orgId: string,
  provider: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: integrationCredentials.id })
    .from(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.organizationId, orgId),
        eq(integrationCredentials.provider, provider),
      )
    )
    .limit(1);
  return row?.id ?? null;
}
