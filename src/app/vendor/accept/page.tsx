import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { findVendorInvitationByToken } from "@/operations/vendor-partnerships";
import { acceptVendorInvitation } from "@/lib/vendor/accept";
import { VendorAcceptClient } from "./VendorAcceptClient";

export const dynamic = "force-dynamic";

export default async function VendorAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) {
    return <ErrorView message="Missing invitation token." />;
  }

  const invite = await findVendorInvitationByToken(token);
  if (!invite) {
    return <ErrorView message="This invitation link is invalid or has expired." />;
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    // Not signed in — bounce to sign-in with a return URL.
    const next = `/vendor/accept?token=${encodeURIComponent(token)}`;
    redirect(`/auth/sign-in?next=${encodeURIComponent(next)}&hint=vendor&email=${encodeURIComponent(invite.email)}`);
  }

  // Signed in but with the wrong email? Tell them; don't auto-accept under
  // someone else's identity.
  if (session.user.email.trim().toLowerCase() !== invite.email.trim().toLowerCase()) {
    return (
      <ErrorView
        message={`This invitation is for ${invite.email}. You're signed in as ${session.user.email}. Sign out and try the link again from the right account.`}
      />
    );
  }

  // Run the accept transaction and redirect to the recruiter UI scoped to
  // the freshly-created vendor org.
  const result = await acceptVendorInvitation(invite.id, {
    userId: session.user.id,
    userName: session.user.name,
  });

  return <VendorAcceptClient vendorOrgId={result.vendorOrgId} vendorOrgName={result.vendorOrgName} />;
}

function ErrorView({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-8">
      <h1 className="mb-2 text-lg font-semibold">Vendor invitation</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
    </main>
  );
}
