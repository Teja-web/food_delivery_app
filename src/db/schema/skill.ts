/**
 * Skill — a reusable agent workflow (system prompt + I/O schema).
 *
 * Callable over the HTTP API by any agent (Cursor, Claude Code, Aider, CI).
 * `projectId` null = org-wide skill available to every project.
 */

import { text, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";
import { projects } from "./project";

export const skills = dillizntSchema.table(
  "skills",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    /** null = available to every project in the org. */
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),

    slug: text().notNull(),
    name: text().notNull(),
    description: text(),
    body: text().notNull(),

    /** JSON-schema-compatible shapes; can be derived from Zod. */
    inputSchema: jsonb("input_schema").$type<Record<string, unknown>>(),
    outputSchema: jsonb("output_schema").$type<Record<string, unknown>>(),

    tags: text().array(),
    enabled: boolean().notNull().default(true),

    createdById: text("created_by_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("skills_org_idx").on(table.organizationId),
    index("skills_project_idx").on(table.projectId),
    index("skills_fts_idx").using(
      "gin",
      sql`dilliznt.fts_vector(${table.name}, ${table.description}, ${table.body})`,
    ),
  ],
);

export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
