import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { roles } from "@/db/schema";
import { and, eq, notInArray } from "drizzle-orm";
import { getPublicOpportunity } from "@/operations/public";
import { fetchReferralForLanding } from "@/actions/referrals";
import { validateReferral } from "@/operations/referrals";

interface PageProps {
  searchParams: Promise<{ slug?: string; ref?: string }>;
}

export const dynamic = "force-dynamic";

/**
 * Consent page for the public-funnel "Sign up to apply" flow.
 *
 * Replaces the old GET-with-side-effects route handler. Renders a single-
 * button form that POSTs to /api/opportunities/claim from the same origin,
 * eliminating the cross-origin-image CSRF surface.
 *
 * Unauthed callers are bounced to sign-in with callbackUrl pointing back
 * here; on return the page renders the consent button.
 */
export default async function ClaimConsentPage({ searchParams }: PageProps) {
  const { slug, ref } = await searchParams;

  if (!slug && !ref) {
    redirect("/opportunities");
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    const params = new URLSearchParams();
    if (slug) params.set("slug", slug);
    if (ref) params.set("ref", ref);
    const cb = encodeURIComponent(`/opportunities/claim?${params.toString()}`);
    redirect(`/auth/sign-in?mode=candidate&callbackUrl=${cb}`);
  }

  // Resolve display data: slug → public DTO; ref-only → look up the role
  // via the referral so we can show *something* even for private roles.
  let displayTitle: string | null = null;
  let displayCompany: string | null = null;

  if (slug) {
    const dto = await getPublicOpportunity(slug, { reveal: Boolean(ref) });
    if (dto) {
      displayTitle = dto.title;
      displayCompany = dto.visibility === "public" ? dto.orgName : null;
    }
  } else if (ref) {
    const validity = await validateReferral(ref);
    if (validity.ok) {
      const [role] = await db
        .select({ title: roles.title })
        .from(roles)
        .where(and(eq(roles.id, validity.referral.roleId), notInArray(roles.status, ["filled", "cancelled"])))
        .limit(1);
      displayTitle = role?.title ?? null;
    }
  }

  if (!displayTitle) {
    redirect("/opportunities");
  }

  const referral = ref ? await fetchReferralForLanding(ref) : null;

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="font-display text-2xl font-bold text-foreground">
          Apply to {displayTitle}
        </h1>
        {displayCompany && (
          <p className="mt-1 text-sm text-muted-foreground">{displayCompany}</p>
        )}

        {referral?.issuedByName && (
          <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <span className="font-medium">{referral.issuedByName}</span>
            <span className="text-amber-800 dark:text-amber-200">
              {" "}
              thought you'd be a fit
              {referral.message ? "." : "."}
            </span>
            {referral.message && (
              <p className="mt-2 text-amber-800 dark:text-amber-200">
                "{referral.message}"
              </p>
            )}
          </div>
        )}

        <p className="mt-4 text-sm text-muted-foreground">
          Submitting will create an application on your dashboard. You can
          complete your profile and add resume details after.
        </p>

        <form
          action="/api/opportunities/claim"
          method="POST"
          className="mt-6 flex flex-col gap-2"
        >
          {slug && <input type="hidden" name="slug" value={slug} />}
          {ref && <input type="hidden" name="ref" value={ref} />}
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-lg transition-opacity hover:opacity-95"
          >
            Apply
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <Link
            href={slug ? `/opportunities/${slug}` : "/opportunities"}
            className="inline-flex items-center justify-center rounded-2xl border border-border bg-background px-6 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Cancel
          </Link>
        </form>
      </div>
    </div>
  );
}
