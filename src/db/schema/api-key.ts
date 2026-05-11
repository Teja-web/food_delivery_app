/**
 * API Key — bearer token for the generic `/api/v1` agent surface.
 *
 * `keyHash` is `sha256(plaintext)`. `prefix` is the first 8 chars of the
 * plaintext, used for fast lookups + UI display. `projectId` null = the
 * key is org-scoped (can read any project in the org).
 */

import { text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";
import { projects } from "./project";

export const apiKeys = dillizntSchema.table(
  "api_keys",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    /** null = org-wide. */
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),

    name: text().notNull(),
    prefix: text().notNull(),
    keyHash: text("key_hash").notNull(),

    createdById: text("created_by_id"),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("api_keys_org_idx").on(table.organizationId),
    index("api_keys_prefix_idx").on(table.prefix),
    unique("api_keys_hash_unique").on(table.keyHash),
  ],
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
