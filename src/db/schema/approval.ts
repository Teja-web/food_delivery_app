/**
 * Approval — a gate request against any entity.
 *
 * Polymorphic: `(entityType, entityId)` targets a `plan`, `phase_gate`,
 * `release`, `work_item`, or anything else that needs explicit sign-off.
 * The downstream effect of approving (e.g. moving a plan from `in_review`
 * to `approved`) is dispatched by `decideApproval` in operations.
 */

import { text, timestamp, index } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";

export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_ENTITY_TYPES = ["plan", "phase_gate", "release", "work_item"] as const;
export type ApprovalEntityType = (typeof APPROVAL_ENTITY_TYPES)[number];

export const approvals = dillizntSchema.table(
  "approvals",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),

    entityType: text("entity_type").$type<ApprovalEntityType>().notNull(),
    entityId: text("entity_id").notNull(),
    /** Optional phase context (which SDLC phase this approval relates to). */
    phase: text(),

    requestedById: text("requested_by_id").notNull(),
    requestedByName: text("requested_by_name"),
    requesterNote: text("requester_note"),

    approverIds: text("approver_ids").array(),

    status: text().$type<ApprovalStatus>().notNull().default("pending"),
    decidedById: text("decided_by_id"),
    decidedByName: text("decided_by_name"),
    decisionNote: text("decision_note"),
    decidedAt: timestamp("decided_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("approvals_entity_idx").on(table.entityType, table.entityId, table.status),
    index("approvals_org_idx").on(table.organizationId),
  ],
);

export type Approval = typeof approvals.$inferSelect;
export type NewApproval = typeof approvals.$inferInsert;
