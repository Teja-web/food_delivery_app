import { text, timestamp, index, unique, jsonb } from "drizzle-orm/pg-core";
import { cozntSchema } from "./schema";

// ============================================
// OAuth Connections (unified table for connections + tokens)
// ============================================

/**
 * Tracks OAuth connections to external services with embedded tokens.
 * Used for calendar (Google, Outlook) and email (Gmail) integrations.
 */
export const oauthConnections = cozntSchema.table("oauth_connections", {
    id: text().primaryKey().notNull(),
    organizationId: text("organization_id").notNull(),
    userId: text("user_id").notNull(),
    // Provider info
    provider: text().notNull(), // e.g., 'google-calendar', 'outlook-calendar', 'google-email'
    category: text().notNull(), // e.g., 'calendar', 'email'
    // Status
    status: text().default('active').notNull(),
    // Account info
    accountEmail: text("account_email"),
    accountName: text("account_name"),
    scopes: jsonb().$type<string[]>(),
    // OAuth tokens (encrypted)
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenType: text("token_type").default("Bearer"),
    tokenExpiresAt: timestamp("token_expires_at", { mode: 'string' }),
    // Timestamps
    connectedAt: timestamp("connected_at", { mode: 'string' }),
    lastUsedAt: timestamp("last_used_at", { mode: 'string' }),
    createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    index("oauth_connections_organization_id_idx").on(table.organizationId),
    index("oauth_connections_user_id_idx").on(table.userId),
    index("oauth_connections_provider_idx").on(table.provider),
    index("oauth_connections_category_idx").on(table.category),
    index("oauth_connections_status_idx").on(table.status),
    unique("oauth_connections_user_provider_unique").on(table.organizationId, table.userId, table.provider),
]);

// ============================================
// Integration Credentials (per-org provider config)
// ============================================

/**
 * Stores per-organization credentials for external providers.
 * Each org brings their own OAuth app credentials or API keys.
 * This is separate from oauth_connections which stores user-level tokens.
 */
export const integrationCredentials = cozntSchema.table("integration_credentials", {
    id: text().primaryKey().notNull(),
    organizationId: text("organization_id").notNull(),
    provider: text().notNull(),
    category: text().notNull(),
    // Credentials (all encrypted)
    clientIdEncrypted: text("client_id_encrypted"),
    clientSecretEncrypted: text("client_secret_encrypted"),
    apiKeyEncrypted: text("api_key_encrypted"),
    // Provider-specific config (e.g., subdomain, tenant ID)
    config: jsonb().$type<Record<string, string>>(),
    // Metadata
    configuredBy: text("configured_by"),
    createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    index("integration_credentials_org_idx").on(table.organizationId),
    unique("integration_credentials_org_provider_unique").on(table.organizationId, table.provider),
]);

// ============================================
// Type Exports
// ============================================

export type OAuthConnection = typeof oauthConnections.$inferSelect;
export type NewOAuthConnection = typeof oauthConnections.$inferInsert;
export type IntegrationCredential = typeof integrationCredentials.$inferSelect;
export type NewIntegrationCredential = typeof integrationCredentials.$inferInsert;
