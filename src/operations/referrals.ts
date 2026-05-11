/**
 * Referral operations.
 *
 * Issuance is gated by `assertCanReferRole`: the issuer must (a) be a member of
 * the role's hiring org, (b) hold an existing application to the role, or
 * (c) the role must be non-private. Without this gate any signed-in user could
 * mint referrals for arbitrary private roles in other orgs and seed candidates
 * into their funnel.
 *
 * Rate limits live in `src/lib/rate-limit.ts` and are applied at the action
 * layer (per-user / hour).
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db/client";
import { applications, candidates, referrals, roles } from "@/db/schema";
import { member } from "@/db/schema/auth";

/**
 * Authorization error for cross-org or unauthorized referral issuance.
 * Distinct class so callers can `instanceof` and translate to a typed result.
 */
export class ReferralForbiddenError extends Error {
  constructor(message = "Cannot refer this role") {
    super(message);
    this.name = "ReferralForbiddenError";
  }
}

export interface CreateReferralInput {
  roleId: string;
  message?: string | null;
  singleUse?: boolean;
  ttlDays?: number;
}

/**
 * Verify the caller is allowed to mint a referral for this role.
 * Throws `ReferralForbiddenError` otherwise.
 *
 * Allowed when:
 *  - The role is non-private (already discoverable)
 *  - The caller is a member of the role's hiring org
 *  - The caller's candidate row has an existing application to this role
 */
async function assertCanReferRole(
  roleId: string,
  ctx: { userId: string; userEmail: string },
): Promise<{ id: string; organizationId: string }> {
  const [role] = await db
    .select({
      id: roles.id,
      organizationId: roles.organizationId,
      publicVisibility: roles.publicVisibility,
    })
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);

  if (!role) throw new Error("Role not found");

  // (c) Non-private roles are discoverable; reshare is fine.
  if (role.publicVisibility !== "private") {
    return { id: role.id, organizationId: role.organizationId };
  }

  // (a) Caller is a member of the hiring org.
  const [memberRow] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(eq(member.userId, ctx.userId), eq(member.organizationId, role.organizationId)),
    )
    .limit(1);
  if (memberRow) {
    return { id: role.id, organizationId: role.organizationId };
  }

  // (b) Caller's candidate row has an existing application to this role.
  // Candidate rows are looked up by email (the canonical link to auth.user).
  const [appRow] = await db
    .select({ id: applications.id })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .where(and(eq(applications.roleId, roleId), eq(candidates.email, ctx.userEmail)))
    .limit(1);
  if (appRow) {
    return { id: role.id, organizationId: role.organizationId };
  }

  throw new ReferralForbiddenError();
}

export async function createReferral(
  input: CreateReferralInput,
  ctx: {
    userId: string;
    userEmail: string;
    userName?: string | null;
    organizationId?: string | null;
  },
) {
  await assertCanReferRole(input.roleId, ctx);

  const ttl = input.ttlDays ?? 30;
  const expiresAt = new Date(Date.now() + ttl * 86_400_000);
  const signedToken = nanoid(32);

  const [created] = await db
    .insert(referrals)
    .values({
      roleId: input.roleId,
      issuedByUserId: ctx.userId,
      issuedByOrgId: ctx.organizationId ?? null,
      issuedByName: ctx.userName ?? null,
      signedToken,
      message: input.message ?? null,
      expiresAt,
      singleUse: input.singleUse ?? false,
      status: "active",
    })
    .returning();
  return created;
}

export async function getReferralByToken(token: string) {
  const [row] = await db
    .select()
    .from(referrals)
    .where(eq(referrals.signedToken, token))
    .limit(1);
  return row ?? null;
}

export type ReferralValidity =
  | { ok: true; referral: typeof referrals.$inferSelect }
  | { ok: false; reason: "not_found" | "expired" | "revoked" | "used" };

/**
 * Read-only validity check used by the public landing page banner.
 * For the actual claim, use `claimReferralAtomic` — this function is racy.
 */
export async function validateReferral(token: string): Promise<ReferralValidity> {
  const referral = await getReferralByToken(token);
  if (!referral) return { ok: false, reason: "not_found" };
  if (referral.status === "revoked") return { ok: false, reason: "revoked" };
  if (referral.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (referral.singleUse && referral.claimedByCandidateId) {
    return { ok: false, reason: "used" };
  }
  return { ok: true, referral };
}

export type ReferralClaimResult =
  | { ok: true; referral: typeof referrals.$inferSelect }
  | { ok: false; reason: "not_found" | "expired" | "revoked" | "used" };

/**
 * Atomically claim a referral for the given candidate. Single round-trip
 * UPDATE…RETURNING with the validity predicate inline — no race window
 * between validate and claim.
 *
 * Idempotent: re-claim by the same candidate matches the WHERE and returns
 * the same row.
 */
export async function claimReferralAtomic(
  token: string,
  candidateId: string,
): Promise<ReferralClaimResult> {
  const updated = await db
    .update(referrals)
    .set({
      claimedByCandidateId: candidateId,
      claimedAt: sql`COALESCE(${referrals.claimedAt}, NOW())`,
      status: sql`CASE WHEN ${referrals.singleUse} THEN 'used' ELSE ${referrals.status} END`,
    })
    .where(
      and(
        eq(referrals.signedToken, token),
        eq(referrals.status, "active"),
        sql`${referrals.expiresAt} > NOW()`,
        sql`(NOT ${referrals.singleUse} OR ${referrals.claimedByCandidateId} IS NULL OR ${referrals.claimedByCandidateId} = ${candidateId})`,
      ),
    )
    .returning();

  if (updated.length > 0) {
    return { ok: true, referral: updated[0] };
  }

  // 0 rows updated → disambiguate the reason for the caller / UI.
  const current = await getReferralByToken(token);
  if (!current) return { ok: false, reason: "not_found" };
  if (current.status === "revoked") return { ok: false, reason: "revoked" };
  if (current.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (
    current.singleUse &&
    current.claimedByCandidateId !== null &&
    current.claimedByCandidateId !== candidateId
  ) {
    return { ok: false, reason: "used" };
  }
  return { ok: false, reason: "not_found" };
}

export async function listMyReferrals(userId: string) {
  return db
    .select()
    .from(referrals)
    .where(eq(referrals.issuedByUserId, userId))
    .orderBy(desc(referrals.createdAt));
}

export async function revokeReferral(id: string, userId: string) {
  // Only the issuer can revoke.
  const [updated] = await db
    .update(referrals)
    .set({ status: "revoked" })
    .where(and(eq(referrals.id, id), eq(referrals.issuedByUserId, userId)))
    .returning();
  return updated ?? null;
}
