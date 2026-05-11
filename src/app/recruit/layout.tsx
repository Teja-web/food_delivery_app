import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { RecruitShell } from "./recruit-shell";
import { seedTourForUserAction } from "@/actions/tours";
import { db } from "@/db/client";
import { organization } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function RecruitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userContext = await getCurrentUser();

  if (!userContext?.currentUser) {
    redirect("/auth/sign-in");
  }

  // Only org members and admins can access the recruiter dashboard.
  // Public signups are candidates — they have no org membership.
  if (!userContext.isAdmin && !userContext.organizationId) {
    redirect("/coach");
  }

  // Resolve the active org's type so the shell can hide Offers for vendors
  // and gate the Vendors settings link to standard-org admins.
  let orgType: "standard" | "vendor" = "standard";
  if (userContext.organizationId) {
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, userContext.organizationId),
      columns: { type: true },
    });
    orgType = org?.type === "vendor" ? "vendor" : "standard";
  }

  // Seed the onboarding tour for first-time users (no-op if already exists)
  seedTourForUserAction("recruit-workflow").catch(() => {});

  return (
    <RecruitShell orgType={orgType} role={userContext.role ?? "member"}>
      {children}
    </RecruitShell>
  );
}
