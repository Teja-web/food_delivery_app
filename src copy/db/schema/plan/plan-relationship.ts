/**
 * Project Task Relationship - typed link between two project tasks.
 *
 * `parent_of` is the dominant case (Epic -> Feature -> Story), but it does
 * not get a special path; it is one row in this table.
 */

import { text, timestamp, index, uniqueIndex, foreignKey } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "../schema";
import { projectTasks } from "./project-task";
import { PLAN_RELATIONSHIP_KINDS, type PlanRelationshipKind } from "./plan-kinds";

export { PLAN_RELATIONSHIP_KINDS, type PlanRelationshipKind };

export const planRelationships = cozntSchema.table(
  "plan_relationships",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),

    fromProjectTasksId: text("from_project_tasks_id").notNull(),
    toProjectTasksId: text("to_project_tasks_id").notNull(),

    kind: text().$type<PlanRelationshipKind>().notNull(),
    note: text(),

    createdById: text("created_by_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("plan_rel_from_idx").on(table.fromProjectTasksId, table.kind),
    index("plan_rel_to_idx").on(table.toProjectTasksId, table.kind),
    uniqueIndex("plan_rel_unique").on(table.fromProjectTasksId, table.toProjectTasksId, table.kind),
    foreignKey({
      columns: [table.fromProjectTasksId],
      foreignColumns: [projectTasks.id],
      name: "plan_relationships_from_project_tasks_id_project_tasks_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.toProjectTasksId],
      foreignColumns: [projectTasks.id],
      name: "plan_relationships_to_project_tasks_id_project_tasks_id_fk",
    }).onDelete("cascade"),
  ],
);

export type PlanRelationship = typeof planRelationships.$inferSelect;
export type NewPlanRelationship = typeof planRelationships.$inferInsert;
