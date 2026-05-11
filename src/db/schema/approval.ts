/**
 * Approval — a gate request against a plan.
 *
 * A plan transitions `draft → in_review` by creating an approval. The
 * approval resolves to `approved` or `rejected`; the plan's status moves
 * accordingly. Multiple approvers can be required (gathered via app config).
 */

import { text, timestamp, index } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";
import { plans } from "./plan";

export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const approvals = dillizntSchema.table(
  "approvals",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),

    requestedById: text("requested_by_id").notNull(),
    requestedByName: text("requested_by_name"),
    requesterNote: text("requester_note"),

    /** Users authorized to decide this approval. */
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
    index("approvals_plan_idx").on(table.planId, table.status),
    index("approvals_org_idx").on(table.organizationId),
  ],
);

export type Approval = typeof approvals.$inferSelect;
export type NewApproval = typeof approvals.$inferInsert;
