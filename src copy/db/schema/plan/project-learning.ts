/**
 * Project Learnings — lightweight per-project notes that surface in the
 * agent's `get_my_context` payload.
 *
 * gstack persists per-project learnings to `~/.gstack/projects/<slug>/
 * learnings.jsonl` and surfaces a count on every skill start. Coznt's
 * equivalent: a typed table on the server, scoped to (organizationId,
 * projectId), surfaced server-side via `get_my_context` so every AI
 * editor session sees the most recent learnings without any local
 * cache.
 *
 * Soft-deleted (not hard-deleted) so the audit log can still cite a
 * learning that was active during a window.
 */

import { text, timestamp, index, integer } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "../schema";
import { projects } from "../project";

export const projectLearnings = cozntSchema.table(
  "project_learnings",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    /** Free-form learning body. Markdown OK; rendered as plain text in MCP. */
    body: text().notNull(),

    /**
     * Pin order — lower numbers surface first. NULL = unpinned, sorts
     * after pinned by created_at desc. Lets operators float critical
     * learnings ("payments service requires CSO sign-off") above noise.
     */
    pinOrder: integer("pin_order"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
    createdById: text("created_by_id"),
    createdByName: text("created_by_name"),
  },
  (table) => [
    index("project_learnings_project_idx").on(
      table.projectId,
      table.pinOrder,
      table.createdAt,
    ),
    index("project_learnings_org_idx").on(table.organizationId),
  ],
);

export type ProjectLearning = typeof projectLearnings.$inferSelect;
export type NewProjectLearning = typeof projectLearnings.$inferInsert;
