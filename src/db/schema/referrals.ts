/**
 * Referrals — token-link-based "X thought you'd be a fit" flow.
 *
 * URL shape: /opportunities/{slug}?ref={signed_token}
 * Redeem: /opportunities/claim?slug=X&ref=token  (consent page POSTs to
 * /api/opportunities/claim, which atomically claims the referral and creates
 * the application; the referrer's signal reveals the role details on the
 * public page).
 *
 * (candidate-portal-plan Phase 5; docs/phase-5-engagement-spec.md.)
 */

import {
  text,
  timestamp,
  boolean,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";
import { roles } from "./roles";
import { candidates } from "./candidates";

export const REFERRAL_STATUSES = ["active", "used", "expired", "revoked"] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export const referrals = dillizntSchema.table(
  "referrals",
  {
    id: text("id").primaryKey().$defaultFn(() => nanoid()),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    /** User id of the issuer (auth.user.id). */
    issuedByUserId: text("issued_by_user_id").notNull(),
    /** Issuer's org at time of issue. Nullable for portal-only candidates. */
    issuedByOrgId: text("issued_by_org_id"),
    /** Display name of the issuer at time of issue (denormalized). */
    issuedByName: text("issued_by_name"),
    /** Signed token in the URL — nanoid(32). */
    signedToken: text("signed_token").notNull(),
    /** Optional personal note from the referrer, shown on the landing page. */
    message: text("message"),
    expiresAt: timestamp("expires_at").notNull(),
    singleUse: boolean("single_use").notNull().default(false),
    status: text("status").$type<ReferralStatus>().notNull().default("active"),
    claimedByCandidateId: text("claimed_by_candidate_id").references(
      () => candidates.id,
      { onDelete: "set null" },
    ),
    claimedAt: timestamp("claimed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("recruit_referrals_token_uniq").on(table.signedToken),
    index("recruit_referrals_role_idx").on(table.roleId),
    index("recruit_referrals_issuer_idx").on(table.issuedByUserId),
  ],
);

export type Referral = typeof referrals.$inferSelect;
export type NewReferral = typeof referrals.$inferInsert;
