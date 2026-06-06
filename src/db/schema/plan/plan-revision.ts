/**
 * Plan Revisions — immutable history of a plan_artifact's body + details.
 *
 * Every save to `plan_artifacts` writes a new row here with the prior content.
 */

import { text, integer, timestamp, jsonb, index, unique } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "../schema";
import { planArtifacts } from "./plan-artifact";

export const planRevisions = cozntSchema.table(
  "plan_revisions",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    planArtifactId: text("plan_artifact_id")
      .notNull()
      .references(() => planArtifacts.id, { onDelete: "cascade" }),

    revisionNumber: integer("revision_number").notNull(),

    body: text().notNull(),
    details: jsonb().$type<Record<string, unknown>>(),
    changeNote: text("change_note"),

    createdById: text("created_by_id"),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("plan_revisions_plan_artifact_idx").on(table.planArtifactId, table.revisionNumber),
    unique("plan_revisions_plan_artifact_revision_unique").on(
      table.planArtifactId,
      table.revisionNumber,
    ),
  ],
);

export type PlanRevision = typeof planRevisions.$inferSelect;
export type NewPlanRevision = typeof planRevisions.$inferInsert;
