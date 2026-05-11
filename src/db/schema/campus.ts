/**
 * Campus invites — student-side invitation tokens issued by university orgs.
 *
 * Mirrors `vendor_invitations` in shape but solves a different problem: the
 * invitee becomes a **candidate** (not a member of the university org).
 * better-auth's `auth.invitation` doesn't fit because students aren't org
 * members; the redeem flow creates a candidate row and inserts an
 * `org_candidates` link to the university with `source = "campus"`.
 *
 * Two issuance modes share the same table:
 *  - **Per-student** (`single_use = true`, `email` set, `max_uses = 1`)
 *  - **Cohort link** (`single_use = false`, `email` null, `max_uses` set or null)
 *
 * (candidate-portal-plan Phase 3; docs/phase-3-campus-spec.md.)
 */

import { text, timestamp, integer, boolean, index, unique } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";

export const CAMPUS_INVITE_STATUSES = ["active", "expired", "revoked"] as const;
export type CampusInviteStatus = (typeof CAMPUS_INVITE_STATUSES)[number];

export const campusInvites = dillizntSchema.table(
  "campus_invites",
  {
    id: text("id").primaryKey().$defaultFn(() => nanoid()),
    /** University org id (organization.type = "university"). */
    universityId: text("university_id").notNull(),
    /** Display label for the invite ("MIT CS 2027"). */
    cohortLabel: text("cohort_label"),
    /** Pre-fills `studentProfile.institution` on redeem. */
    institutionName: text("institution_name"),
    /** Signed token used in /auth/sign-up?campus=… URLs. Unique. */
    signedToken: text("signed_token").notNull(),
    /**
     * If set, the invite is single-use bound to this email — only that user
     * can redeem. If null and `singleUse = false`, anyone with the link can
     * redeem until `useCount >= maxUses`.
     */
    email: text("email"),
    singleUse: boolean("single_use").notNull().default(true),
    /** Optional cap for cohort links. NULL = unlimited (within TTL). */
    maxUses: integer("max_uses"),
    useCount: integer("use_count").notNull().default(0),
    expiresAt: timestamp("expires_at").notNull(),
    status: text("status").notNull().default("active"),
    /** For single-use invites: the candidate that redeemed it. */
    usedByCandidateId: text("used_by_candidate_id"),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdById: text("created_by_id"),
    createdByName: text("created_by_name"),
  },
  (table) => [
    unique("recruit_campus_invites_token_uniq").on(table.signedToken),
    index("recruit_campus_invites_uni_idx").on(table.universityId),
    index("recruit_campus_invites_email_idx").on(table.email),
  ],
);

export type CampusInvite = typeof campusInvites.$inferSelect;
export type NewCampusInvite = typeof campusInvites.$inferInsert;
