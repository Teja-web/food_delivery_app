import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { roles } from "@/db/schema";
import { validateReferral } from "@/operations/referrals";

export const dynamic = "force-dynamic";

/**
 * GET /r/[token]
 *
 * Public share-link resolver. Looks up the referral, resolves to the
 * role's public slug if it has one, then redirects to
 *   /opportunities/{slug}?ref={token}
 * which renders the public landing page with the "X thought you'd be a fit"
 * banner.
 *
 * If the role is private (no public slug), redirect straight to the claim
 * route, which resolves slug → role server-side and creates the application
 * after sign-in. The recipient sees no public landing in that case — they
 * just get bounced to sign-in then to the dashboard with the application
 * already created.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.redirect(new URL("/", _req.url));
  }

  const validity = await validateReferral(token);
  if (!validity.ok) {
    return NextResponse.redirect(new URL(`/?ref_error=${validity.reason}`, _req.url));
  }

  const [role] = await db
    .select({ publicSlug: roles.publicSlug, publicVisibility: roles.publicVisibility })
    .from(roles)
    .where(eq(roles.id, validity.referral.roleId))
    .limit(1);

  if (!role) {
    return NextResponse.redirect(new URL("/", _req.url));
  }

  // If the role has a public slug, redirect to the public landing with the
  // ref param so the banner + reveal apply.
  if (role.publicSlug) {
    return NextResponse.redirect(
      new URL(`/opportunities/${role.publicSlug}?ref=${token}`, _req.url),
    );
  }

  // Private role — bounce to the claim consent page directly. The page
  // handles auth, then renders a single-button form that POSTs to the API
  // (no GET-with-side-effects).
  return NextResponse.redirect(
    new URL(`/opportunities/claim?ref=${token}`, _req.url),
  );
}
