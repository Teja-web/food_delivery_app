import { getInvitation, checkUserExistsByEmail } from "@/actions/members";
import { AcceptInvitationClient } from "./AcceptInvitationClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AcceptInvitationPage({ params }: Props) {
  const { id: invitationId } = await params;
  const invitation = await getInvitation(invitationId);

  if (!invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <span className="text-destructive text-xl">✕</span>
          </div>
          <h1 className="text-xl font-semibold">Invitation Not Found</h1>
          <p className="text-muted-foreground">
            This invitation doesn&apos;t exist or has been revoked.
          </p>
          <a
            href="/auth/sign-in"
            className="inline-block text-sm text-primary hover:underline font-medium"
          >
            Go to Sign In
          </a>
        </div>
      </div>
    );
  }

  const isExpired = new Date(invitation.expiresAt) < new Date();
  const isAlreadyAccepted = invitation.status !== "pending";

  if (isExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto">
            <span className="text-amber-500 text-xl">⏱</span>
          </div>
          <h1 className="text-xl font-semibold">Invitation Expired</h1>
          <p className="text-muted-foreground">
            This invitation has expired. Please contact your admin for a new invitation.
          </p>
          <a
            href="/"
            className="inline-block text-sm text-primary hover:underline font-medium"
          >
            Go to Homepage
          </a>
        </div>
      </div>
    );
  }

  if (isAlreadyAccepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center mx-auto">
            <span className="text-green-500 text-xl">✓</span>
          </div>
          <h1 className="text-xl font-semibold">Invitation Already Accepted</h1>
          <p className="text-muted-foreground">
            This invitation has already been used. Sign in to access your account.
          </p>
          <a
            href="/auth/sign-in"
            className="inline-block text-sm text-primary hover:underline font-medium"
          >
            Sign In
          </a>
        </div>
      </div>
    );
  }

  const userExists = await checkUserExistsByEmail(invitation.email);

  return (
    <AcceptInvitationClient
      invitationId={invitation.id}
      email={invitation.email}
      organizationName={invitation.organizationName}
      inviterName={invitation.inviterName}
      userExists={userExists}
    />
  );
}
