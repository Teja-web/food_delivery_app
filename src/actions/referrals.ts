"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  createReferral,
  listMyReferrals,
  ReferralForbiddenError,
  revokeReferral,
  validateReferral,
  type CreateReferralInput,
} from "@/operations/referrals";
import { checkRateLimit } from "@/lib/rate-limit";

async function requireAuthSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Not authenticated");
  return session;
}

export type CreateReferralResult =
  | { ok: true; referral: Awaited<ReturnType<typeof createReferral>> }
  | { ok: false; reason: "forbidden" | "role_not_found" | "rate_limited" };

/**
 * Per-user/hour cap on referral issuance. Server actions don't pass through
 * src/proxy.ts (the proxy keys off IP, but a logged-in user could share a
 * NAT'd IP with hundreds of others), so this stays inline. It's the only
 * remaining inline rate-limit call — every public HTTP edge is centralized
 * in the proxy.
 */
export async function createReferralAction(
  input: CreateReferralInput,
): Promise<CreateReferralResult> {
  const session = await requireAuthSession();
  const rl = await checkRateLimit({
    key: `refer:user:${session.user.id}`,
    max: 20,
    windowMs: 60 * 60_000,
  });
  if (!rl.ok) return { ok: false, reason: "rate_limited" };
  try {
    const created = await createReferral(input, {
      userId: session.user.id,
      userEmail: session.user.email,
      userName: session.user.name ?? null,
      // Issuer org left null for portal-only candidates; vendor/uni admins
      // may have an org session, but we don't need it for the redeem path.
      organizationId: null,
    });
    revalidatePath("/refer", "page");
    return { ok: true, referral: created };
  } catch (err) {
    if (err instanceof ReferralForbiddenError) {
      return { ok: false, reason: "forbidden" };
    }
    if (err instanceof Error && err.message === "Role not found") {
      return { ok: false, reason: "role_not_found" };
    }
    throw err;
  }
}

export async function fetchMyReferrals() {
  const session = await requireAuthSession();
  return listMyReferrals(session.user.id);
}

export async function revokeReferralAction(id: string) {
  const session = await requireAuthSession();
  return revokeReferral(id, session.user.id);
}

/** Read-only validity check used by the public landing page banner. */
export async function fetchReferralForLanding(token: string) {
  if (!token) return null;
  const result = await validateReferral(token);
  if (!result.ok) return null;
  return {
    issuedByName: result.referral.issuedByName,
    message: result.referral.message,
    roleId: result.referral.roleId,
  };
}
