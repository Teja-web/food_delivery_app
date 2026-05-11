import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { redeemCampusInvite } from "@/operations/campus";

export const dynamic = "force-dynamic";

/**
 * POST /api/campus/claim
 *
 * Same-origin form submission from /campus/claim. Redeems the campus invite
 * (sets candidate.kind = "student", inserts the org_candidates link to the
 * university) and redirects to /dashboard.
 *
 * Idempotent — re-redeeming the same token by the same user is safe.
 *
 * GET is no longer supported. The consent page lives at /campus/claim and
 * POSTs here — this avoids the GET-with-side-effects CSRF surface.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const form = await req.formData();
  const token = (form.get("token") as string | null)?.trim();
  if (!token) {
    return new NextResponse("missing_token", { status: 400 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const result = await redeemCampusInvite({
    token,
    userEmail: session.user.email,
    userName: session.user.name ?? "",
  });

  if (!result.ok) {
    return NextResponse.redirect(
      new URL(`/dashboard?campus_error=${result.reason}`, req.url),
      303,
    );
  }

  return NextResponse.redirect(new URL("/dashboard", req.url), 303);
}
