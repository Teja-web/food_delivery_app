/**
 * Plan Relationship — typed link between two plan artifacts.
 *
 * Replaces the privileged `parentPlanId` column with a uniform relationship
 * surface. `parent_of` is the dominant case (Epic → Feature → Story) but
 * doesn't get a special path: it's one row in this table.
 *
 * Kinds: parent_of | supersedes | derived_from | blocks | relates_to | causes | references
 */

import { text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "../schema";
import { planArtifacts } from "./plan-artifact";
import { PLAN_RELATIONSHIP_KINDS, type PlanRelationshipKind } from "./plan-kinds";

export { PLAN_RELATIONSHIP_KINDS, type PlanRelationshipKind };

export const planRelationships = cozntSchema.table(
  "plan_relationships",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),

    fromPlanArtifactId: text("from_plan_artifact_id")
      .notNull()
      .references(() => planArtifacts.id, { onDelete: "cascade" }),
    toPlanArtifactId: text("to_plan_artifact_id")
      .notNull()
      .references(() => planArtifacts.id, { onDelete: "cascade" }),

    kind: text().$type<PlanRelationshipKind>().notNull(),
    note: text(),

    createdById: text("created_by_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("plan_rel_from_idx").on(table.fromPlanArtifactId, table.kind),
    index("plan_rel_to_idx").on(table.toPlanArtifactId, table.kind),
    uniqueIndex("plan_rel_unique").on(table.fromPlanArtifactId, table.toPlanArtifactId, table.kind),
  ],
);

export type PlanRelationship = typeof planRelationships.$inferSelect;
export type NewPlanRelationship = typeof planRelationships.$inferInsert;
