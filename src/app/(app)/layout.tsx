import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell/AppShell";
import { OrgStandardsOnboardingWizard } from "@/components/feature/standards/OrgStandardsOnboardingWizard";
import { db } from "@/db/client";
import { organization } from "@/db/schema/auth";
import { getCurrentUser } from "@/lib/auth/actions";
import { getOrgStandardsReadiness, STANDARD_KIND_LABELS } from "@/operations/standards";

async function getOrgName(organizationId: string): Promise<string> {
  const [row] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row?.name ?? "Workspace";
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { currentUser, organizationId, role } = await getCurrentUser();
  if (!currentUser) redirect("/auth/sign-in");
  if (!organizationId) redirect("/auth/sign-in");

  const [orgName, standardsReadiness] = await Promise.all([
    getOrgName(organizationId),
    getOrgStandardsReadiness(organizationId),
  ]);

  if (!standardsReadiness.requiredComplete) {
    return (
      <OrgStandardsOnboardingWizard
        orgName={orgName}
        missingRequiredLabels={standardsReadiness.missingRequired.map(
          (kind) => STANDARD_KIND_LABELS[kind],
        )}
      />
    );
  }

  return (
    <AppShell user={currentUser} role={role} orgName={orgName}>
      {children}
    </AppShell>
  );
}
