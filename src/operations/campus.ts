/**
 * Campus invite operations. Two flavors of issuance share one table; the
 * redeem flow is the same for both.
 *
 * (candidate-portal-plan Phase 3; docs/phase-3-campus-spec.md.)
 */

import { and, desc, eq, gt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db/client";
import { campusInvites, candidates, orgCandidates } from "@/db/schema";
import { getActionContext } from "@/lib/auth/context";
import { ensurePortalCandidate } from "./portal";

export interface CreateCampusInviteInput {
  cohortLabel?: string | null;
  institutionName?: string | null;
  email?: string | null;
  singleUse?: boolean;
  maxUses?: number | null;
  expiresAt: Date;
}

/* -- Issuance ---------------------------------------------------------- */

export async function createCampusInvite(input: CreateCampusInviteInput) {
  const ctx = await getActionContext();
  // Token = 32-char nanoid → ~128 bits of entropy, not enumerable.
  const signedToken = nanoid(32);
  const [created] = await db
    .insert(campusInvites)
    .values({
      universityId: ctx.organizationId,
      cohortLabel: input.cohortLabel ?? null,
      institutionName: input.institutionName ?? null,
      email: input.email?.trim().toLowerCase() ?? null,
      singleUse: input.singleUse ?? true,
      maxUses: input.maxUses ?? null,
      signedToken,
      expiresAt: input.expiresAt,
      status: "active",
      createdById: ctx.userId ?? null,
      createdByName: ctx.user?.name ?? null,
    })
    .returning();
  return created;
}

export async function listCampusInvites() {
  const ctx = await getActionContext();
  return db
    .select()
    .from(campusInvites)
    .where(eq(campusInvites.universityId, ctx.organizationId))
    .orderBy(desc(campusInvites.createdAt));
}

export async function revokeCampusInvite(id: string) {
  const ctx = await getActionContext();
  const [updated] = await db
    .update(campusInvites)
    .set({ status: "revoked" })
    .where(and(eq(campusInvites.id, id), eq(campusInvites.universityId, ctx.organizationId)))
    .returning();
  return updated;
}

/* -- Redeem ------------------------------------------------------------ */

export type RedeemResult =
  | { ok: true; universityId: string; institutionName: string | null }
  | { ok: false; reason: "not_found" | "expired" | "revoked" | "exhausted" | "wrong_email" };

/**
 * Redeem a campus invite for the given user. Validates the invite, ensures
 * a candidate row, sets candidate.kind = "student", pre-fills
 * studentProfile.institution if empty, and inserts an org_candidates link
 * for the university with source = "campus". Idempotent — re-redeems are
 * safe (returns ok with the same effect).
 */
export async function redeemCampusInvite(params: {
  token: string;
  userEmail: string;
  userName: string;
}): Promise<RedeemResult> {
  const [invite] = await db
    .select()
    .from(campusInvites)
    .where(eq(campusInvites.signedToken, params.token))
    .limit(1);
  if (!invite) return { ok: false, reason: "not_found" };
  if (invite.status === "revoked") return { ok: false, reason: "revoked" };
  if (invite.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };

  // Cohort-link cap check.
  if (!invite.singleUse && invite.maxUses != null && invite.useCount >= invite.maxUses) {
    return { ok: false, reason: "exhausted" };
  }

  // Per-student bound — must match.
  const userEmail = params.userEmail.trim().toLowerCase();
  if (invite.email && invite.email !== userEmail) {
    return { ok: false, reason: "wrong_email" };
  }

  // Single-use: don't allow a second redemption (other than the original
  // candidate's idempotent retry — handled by the org_candidates dedupe).
  if (invite.singleUse && invite.usedByCandidateId) {
    // Look up the original redeemer; if it's the same user, treat as idempotent.
    const [originalCandidate] = await db
      .select({ email: candidates.email })
      .from(candidates)
      .where(eq(candidates.id, invite.usedByCandidateId))
      .limit(1);
    if (!originalCandidate || originalCandidate.email.toLowerCase() !== userEmail) {
      return { ok: false, reason: "exhausted" };
    }
  }

  // Ensure candidate row exists.
  const candidate = await ensurePortalCandidate(userEmail, params.userName ?? "");
  if (!candidate) return { ok: false, reason: "not_found" };

  // Set kind = student. Merge institution into studentProfile if absent.
  const profileJson = (candidate.profile ?? {}) as Record<string, unknown>;
  const studentProfile = (profileJson.studentProfile ?? {}) as Record<string, unknown>;
  if (invite.institutionName && !studentProfile.institution) {
    studentProfile.institution = invite.institutionName;
    profileJson.studentProfile = studentProfile;
  }
  await db
    .update(candidates)
    .set({
      kind: "student",
      // jsonb column — extending the structured CandidateProfile with the
      // student-profile sub-object. Cast through unknown to satisfy Drizzle's
      // strict $type<CandidateProfile> narrowing.
      profile: profileJson as unknown as typeof candidates.$inferInsert.profile,
      updatedAt: new Date(),
    })
    .where(eq(candidates.id, candidate.id));

  // Insert org_candidates row for the university (idempotent via unique
  // (organizationId, candidateId) constraint).
  await db
    .insert(orgCandidates)
    .values({
      organizationId: invite.universityId,
      candidateId: candidate.id,
      addedByOrgId: null,
      addedById: null,
      addedByName: null,
      source: "campus",
    })
    .onConflictDoNothing();

  // Mark invite used.
  if (invite.singleUse) {
    await db
      .update(campusInvites)
      .set({
        usedByCandidateId: candidate.id,
        usedAt: new Date(),
        useCount: 1,
      })
      .where(eq(campusInvites.id, invite.id));
  } else {
    await db
      .update(campusInvites)
      .set({ useCount: sql`${campusInvites.useCount} + 1` })
      .where(eq(campusInvites.id, invite.id));
  }

  return { ok: true, universityId: invite.universityId, institutionName: invite.institutionName };
}

/* -- Public token lookup ---------------------------------------------- */

/**
 * Read-only lookup used by the public /campus/claim consent page to display
 * the institution name before the user submits. No org-scope — the token
 * itself is the unguessable bearer.
 */
export async function getCampusInviteForLanding(token: string) {
  const { organization } = await import("@/db/schema/auth");
  const [row] = await db
    .select({
      id: campusInvites.id,
      status: campusInvites.status,
      expiresAt: campusInvites.expiresAt,
      institutionName: campusInvites.institutionName,
      cohortLabel: campusInvites.cohortLabel,
      universityName: organization.name,
    })
    .from(campusInvites)
    .innerJoin(organization, eq(organization.id, campusInvites.universityId))
    .where(eq(campusInvites.signedToken, token))
    .limit(1);
  if (!row) return null;
  if (row.status !== "active" || row.expiresAt.getTime() < Date.now()) return null;
  return {
    institutionName: row.institutionName ?? row.universityName ?? null,
    cohortLabel: row.cohortLabel,
  };
}

/* -- Visibility helper ------------------------------------------------- */

export async function isUniversityOrg(organizationId: string): Promise<boolean> {
  const { organization } = await import("@/db/schema/auth");
  const [row] = await db
    .select({ type: organization.type })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row?.type === "university";
}

/* Filter helper used by the admin UI to surface only active, redeemable invites. */
export async function listActiveCampusInvites() {
  const ctx = await getActionContext();
  return db
    .select()
    .from(campusInvites)
    .where(
      and(
        eq(campusInvites.universityId, ctx.organizationId),
        eq(campusInvites.status, "active"),
        gt(campusInvites.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(campusInvites.createdAt));
}
