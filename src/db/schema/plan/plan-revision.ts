/**
 * Plan Revisions — immutable history of a plan's body + details.
 *
 * Every save to `plans` writes a new row here with the prior content. The
 * live `plans` row reflects the current state for query efficiency; this
 * table is the audit trail.
 */

import { text, integer, timestamp, jsonb, index, unique } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "../schema";
import { plans } from "./plan";

export const planRevisions = cozntSchema.table(
  "plan_revisions",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),

    revisionNumber: integer("revision_number").notNull(),

    body: text().notNull(),
    details: jsonb().$type<Record<string, unknown>>(),
    changeNote: text("change_note"),

    createdById: text("created_by_id"),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("plan_revisions_plan_idx").on(table.planId, table.revisionNumber),
    unique("plan_revisions_plan_revision_unique").on(table.planId, table.revisionNumber),
  ],
);

export type PlanRevision = typeof planRevisions.$inferSelect;
export type NewPlanRevision = typeof planRevisions.$inferInsert;
