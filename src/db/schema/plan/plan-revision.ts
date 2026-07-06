/**
 * Plan Revisions - immutable history of a project task's body + details.
 *
 * Every save to `project_tasks` writes a new row here with the prior content.
 */

import { text, integer, timestamp, jsonb, index, unique, foreignKey } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "../schema";
import { projectTasks } from "./project-task";

export const planRevisions = cozntSchema.table(
  "plan_revisions",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    projectTasksId: text("project_tasks_id").notNull(),

    revisionNumber: integer("revision_number").notNull(),

    body: text().notNull(),
    details: jsonb().$type<Record<string, unknown>>(),
    changeNote: text("change_note"),

    createdById: text("created_by_id"),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("plan_revisions_project_tasks_idx").on(table.projectTasksId, table.revisionNumber),
    unique("plan_revisions_project_tasks_revision_unique").on(
      table.projectTasksId,
      table.revisionNumber,
    ),
    foreignKey({
      columns: [table.projectTasksId],
      foreignColumns: [projectTasks.id],
      name: "plan_revisions_project_tasks_id_project_tasks_id_fk",
    }).onDelete("cascade"),
  ],
);

export type PlanRevision = typeof planRevisions.$inferSelect;
export type NewPlanRevision = typeof planRevisions.$inferInsert;
