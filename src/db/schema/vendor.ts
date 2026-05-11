/**
 * Vendor schema — partnerships between hiring orgs and vendor orgs, plus the
 * out-of-band invitation table that bootstraps a vendor's first sign-in.
 * See docs/vendor-and-attribution-plan.md Phase 3.
 */

import { text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";

export const VENDOR_PARTNERSHIP_STATUSES = ["active", "paused"] as const;
export type VendorPartnershipStatus = typeof VENDOR_PARTNERSHIP_STATUSES[number];

export const vendorPartnerships = dillizntSchema.table("vendor_partnerships", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  hiringOrgId: text("hiring_org_id").notNull(),
  vendorOrgId: text("vendor_org_id").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdById: text("created_by_id"),
  createdByName: text("created_by_name"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedById: text("updated_by_id"),
  updatedByName: text("updated_by_name"),
}, (table) => [
  index("recruit_vendor_partnerships_hiring_idx").on(table.hiringOrgId),
  index("recruit_vendor_partnerships_vendor_idx").on(table.vendorOrgId),
  unique("recruit_vendor_partnerships_uniq").on(table.hiringOrgId, table.vendorOrgId),
]);

export type VendorPartnership = typeof vendorPartnerships.$inferSelect;
export type NewVendorPartnership = typeof vendorPartnerships.$inferInsert;

export const VENDOR_INVITATION_STATUSES = ["pending", "accepted", "cancelled", "expired"] as const;
export type VendorInvitationStatus = typeof VENDOR_INVITATION_STATUSES[number];

/**
 * Out-of-band vendor partnership invitation. We don't reuse `auth.invitation`
 * because better-auth's accept flow adds the invitee to `invitation.organizationId`
 * — for vendor invites we need to create a NEW vendor org and add them to that
 * instead. The accept link is `/vendor/accept?token=...`.
 */
export const vendorInvitations = dillizntSchema.table("vendor_invitations", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  hiringOrgId: text("hiring_org_id").notNull(),
  email: text("email").notNull(),
  proposedVendorOrgName: text("proposed_vendor_org_name").notNull(),
  acceptToken: text("accept_token").notNull(),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdById: text("created_by_id"),
  createdByName: text("created_by_name"),
  acceptedAt: timestamp("accepted_at"),
  acceptedByUserId: text("accepted_by_user_id"),
}, (table) => [
  unique("recruit_vendor_invitations_token_uniq").on(table.acceptToken),
  index("recruit_vendor_invitations_hiring_idx").on(table.hiringOrgId),
  index("recruit_vendor_invitations_email_idx").on(table.email),
]);

export type VendorInvitation = typeof vendorInvitations.$inferSelect;
export type NewVendorInvitation = typeof vendorInvitations.$inferInsert;
