/**
 * Environment — explicit deploy target.
 *
 * Replaces the free-text `deployments.environment` column with a typed row
 * per project. `tier` groups environments by criticality (production,
 * preproduction, development) so policies can target tiers without hardcoding
 * names.
 */

import { text, timestamp, jsonb, index, unique } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";
import { projects } from "./project";

export const ENVIRONMENT_TIERS = ["production", "preproduction", "development"] as const;
export type EnvironmentTier = (typeof ENVIRONMENT_TIERS)[number];

export const environments = cozntSchema.table(
  "environments",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    name: text().notNull(),
    tier: text().$type<EnvironmentTier>(),
    url: text(),
    metadata: jsonb().$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("environments_project_idx").on(table.projectId),
    index("environments_org_idx").on(table.organizationId),
    unique("environments_project_name_unique").on(table.projectId, table.name),
  ],
);

export type Environment = typeof environments.$inferSelect;
export type NewEnvironment = typeof environments.$inferInsert;
