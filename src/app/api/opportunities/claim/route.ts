import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { and, eq, ne } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { roles } from "@/db/schema";
import {
  createPortalRoleInterest,
  ensurePortalCandidate,
} from "@/operations/portal";
import { claimReferralAtomic, validateReferral } from "@/operations/referrals";
import { isUniqueViolation } from "@/lib/db-errors";

export const dynamic = "force-dynamic";

/**
 * POST /api/opportunities/claim
 *
 * Same-origin form submission from /opportunities/claim. Reads `slug` and/or
 * `ref` from the form body, ensures a candidate row, creates the role-interest
 * application, atomically claims the referral if one rode along, and redirects
 * to /dashboard?reveal=<slug>.
 *
 * Idempotent: re-claiming an already-applied role still redirects with the
 * reveal banner.
 *
 * GET is no longer supported — the consent-page lives at /opportunities/claim
 * and it POSTs here. This avoids the cross-origin-image CSRF that GET allowed.
 */
export async function POST(req: NextRequest) {
  // Same-origin guard: SameSite=Lax cookies already block cross-origin POSTs
  // from picking up the session, but reject explicitly for defense in depth.
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const form = await req.formData();
  const slug = (form.get("slug") as string | null)?.trim() || null;
  const refToken = (form.get("ref") as string | null)?.trim() || null;

  if (!slug && !refToken) {
    return new NextResponse("missing_identifier", { status: 400 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  // Resolve the role. Prefer slug when present; fall back to the ref's
  // roleId. Ref-only resolution lets us claim a private role through a
  // referral without a public slug.
  let role: { id: string; organizationId: string } | null = null;

  if (slug) {
    const [bySlug] = await db
      .select({
        id: roles.id,
        organizationId: roles.organizationId,
      })
      .from(roles)
      .where(and(eq(roles.publicSlug, slug), ne(roles.publicVisibility, "private")))
      .limit(1);
    role = bySlug ?? null;
  } else if (refToken) {
    const validity = await validateReferral(refToken);
    if (validity.ok) {
      const [byRef] = await db
        .select({ id: roles.id, organizationId: roles.organizationId })
        .from(roles)
        .where(eq(roles.id, validity.referral.roleId))
        .limit(1);
      role = byRef ?? null;
    }
  }

  if (!role) {
    return NextResponse.redirect(new URL("/opportunities", req.url), 303);
  }

  const candidate = await ensurePortalCandidate(
    session.user.email,
    session.user.name ?? "",
  );
  if (!candidate) {
    return NextResponse.redirect(new URL("/opportunities", req.url), 303);
  }

  try {
    await createPortalRoleInterest(candidate.id, role.id);
  } catch (err) {
    if (!isUniqueViolation(err, "recruit_pipeline_role_candidate_uniq")) {
      console.error("createPortalRoleInterest failed", {
        err,
        candidateId: candidate.id,
        roleId: role.id,
      });
      return new NextResponse("application_create_failed", { status: 500 });
    }
    // Unique violation = already applied. Fall through to the reveal redirect.
  }

  // Atomically claim the referral if a token rode along. Failures here are
  // non-fatal for the application creation, but we log unexpected ones.
  if (refToken) {
    try {
      await claimReferralAtomic(refToken, candidate.id);
    } catch (err) {
      console.error("claimReferralAtomic failed", { err, refToken });
    }
  }

  return NextResponse.redirect(
    new URL(slug ? `/dashboard?reveal=${slug}` : `/dashboard`, req.url),
    303,
  );
}
