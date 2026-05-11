/**
 * AdapterBinding — maps a coznt project to an external system entity
 * (GitHub repo, Jira project, ADO project, Confluence space).
 *
 * When a webhook arrives at /api/v1/webhooks/[source], we don't know which
 * coznt project the event belongs to — this table closes that gap. The
 * resolver (`src/lib/integrations/resolve.ts`) looks up
 * (organizationId, provider, externalKey) and returns the local projectId.
 *
 * ## `externalKey` format per provider
 *
 * - `github`     — `host/owner/repo` (e.g. `github.com/acme/api`).
 *                  Includes host so GitHub Enterprise (e.g.
 *                  `ghe.acme.com/acme/api`) and dotcom can coexist.
 * - `jira`       — Jira project key (e.g. `ACME`)
 * - `ado`        — `organization/project` (e.g. `acme-org/api`)
 * - `confluence` — space key (e.g. `ENG`)
 */

import { text, timestamp, jsonb, index, unique } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";
import { projects } from "./project";

export const ADAPTER_PROVIDERS = ["github", "jira", "ado", "confluence"] as const;
export type AdapterProvider = (typeof ADAPTER_PROVIDERS)[number];

export const adapterBindings = cozntSchema.table(
  "adapter_bindings",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    provider: text().$type<AdapterProvider>().notNull(),
    /**
     * Identifier of the external entity within the provider.
     * See the file header for the per-provider format.
     */
    externalKey: text("external_key").notNull(),

    /** Optional per-binding configuration (branch filter, env mapping, etc.). */
    config: jsonb().$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("adapter_bindings_org_idx").on(table.organizationId),
    index("adapter_bindings_project_idx").on(table.projectId),
    // Resolver lookup path: (org, provider, externalKey) → projectId.
    unique("adapter_bindings_org_provider_key_unique").on(
      table.organizationId,
      table.provider,
      table.externalKey,
    ),
  ],
);

export type AdapterBinding = typeof adapterBindings.$inferSelect;
export type NewAdapterBinding = typeof adapterBindings.$inferInsert;
