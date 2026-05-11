import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, GraduationCap } from "lucide-react";
import { auth } from "@/lib/auth";
import { getCampusInviteForLanding } from "@/operations/campus";

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export const dynamic = "force-dynamic";

/**
 * Consent page for campus invite redemption.
 *
 * Replaces the old GET-with-side-effects route handler. Renders a single-
 * button form that POSTs to /api/campus/claim from the same origin —
 * no GET-with-side-effects, no CSRF surface.
 */
export default async function CampusClaimPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  if (!token) redirect("/");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    const cb = encodeURIComponent(`/campus/claim?token=${token}`);
    redirect(`/auth/sign-in?mode=candidate&callbackUrl=${cb}`);
  }

  const invite = await getCampusInviteForLanding(token);
  if (!invite) {
    return (
      <div className="mx-auto max-w-md px-6 py-16">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <h1 className="font-display text-xl font-bold text-foreground">
            Invitation unavailable
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This campus invite link is invalid, expired, or has been revoked.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center justify-center rounded-2xl border border-border bg-background px-6 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const institution = invite.institutionName ?? "your institution";

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-amber-700">
          <GraduationCap className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wide">
            Campus invite
          </span>
        </div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Join {institution}
        </h1>
        {invite.cohortLabel && (
          <p className="mt-1 text-sm text-muted-foreground">
            {invite.cohortLabel}
          </p>
        )}
        <p className="mt-4 text-sm text-muted-foreground">
          Joining links your profile to {institution} and unlocks the student
          experience: career-path explorer, prep tools, and recruiter visibility.
        </p>

        <form
          action="/api/campus/claim"
          method="POST"
          className="mt-6 flex flex-col gap-2"
        >
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-lg transition-opacity hover:opacity-95"
          >
            Join {institution}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-2xl border border-border bg-background px-6 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Not now
          </Link>
        </form>
      </div>
    </div>
  );
}
