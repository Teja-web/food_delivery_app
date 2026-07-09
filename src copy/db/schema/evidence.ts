/**
 * Evidence Link — uniform traceability from a project_task to a proof artifact.
 *
 * Polymorphic pointer. `evidenceType` selects the target table; `evidenceId`
 * is the foreign key (resolved at query time per type). `external_link` uses
 * `externalUrl` only.
 *
 * Verification debt is a query over this table: plans in `completed` with
 * no `evidence_links` row of the expected type. No special tracking table.
 */

import { text, timestamp, index } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";
import { projects } from "./project";
import { projectTasks } from "./plan/project-task";
import {
  EVIDENCE_TYPES,
  EVIDENCE_ROLES,
  type EvidenceType,
  type EvidenceRole,
} from "./evidence-kinds";

export {
  EVIDENCE_TYPES,
  EVIDENCE_ROLES,
  type EvidenceType,
  type EvidenceRole,
};

export const evidenceLinks = cozntSchema.table(
  "evidence_links",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    projectTaskId: text("project_tasks_id")
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),

    evidenceType: text("evidence_type").$type<EvidenceType>().notNull(),
    /** Target row id; null for `external_link`. */
    evidenceId: text("evidence_id"),
    /** For `external_link` only. */
    externalUrl: text("external_url"),

    role: text().$type<EvidenceRole>(),
    note: text(),

    attachedById: text("attached_by_id"),
    attachedByName: text("attached_by_name"),
    attachedAt: timestamp("attached_at").defaultNow().notNull(),
  },
  (table) => [
    index("evidence_plan_idx").on(table.projectTaskId, table.evidenceType),
    index("evidence_target_idx").on(table.evidenceType, table.evidenceId),
    index("evidence_project_idx").on(table.projectId, table.evidenceType),
  ],
);

export type EvidenceLink = typeof evidenceLinks.$inferSelect;
export type NewEvidenceLink = typeof evidenceLinks.$inferInsert;
