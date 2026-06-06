/**
 * API Key — bearer token for the generic `/api/v1` agent surface.
 *
 * `keyHash` is `sha256(plaintext)`. `prefix` is the first 8 chars of the
 * plaintext, used for fast lookups + UI display. Every key is bound to
 * exactly one project — IDE sessions auto-bind from the key at handshake,
 * no `set_project` round-trip needed.
 */

import { text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";
import { projects } from "./project";

export const apiKeys = cozntSchema.table(
  "api_keys",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    name: text().notNull(),
    prefix: text().notNull(),
    keyHash: text("key_hash").notNull(),
    /**
     * Authorization role for this key. `member` (default) covers normal
     * read/write/skill traffic from IDE agents. `admin` / `owner` keys can
     * also hit governance-sensitive routes (e.g. deciding governance_records,
     * mutating skill_autonomy). Mint a separate admin key for CI/promotion
     * automation; keep IDE keys at `member` so a leaked editor token can't
     * approve its own work.
     */
    role: text().notNull().default("member"),

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
