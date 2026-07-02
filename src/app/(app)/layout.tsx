import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell/AppShell";
import { OrgStandardsOnboardingWizard } from "@/components/feature/standards/OrgStandardsOnboardingWizard";
import { db } from "@/db/client";
import { organization } from "@/db/schema/auth";
import { getCurrentUser } from "@/lib/auth/actions";
import {
  getOrganizationArtifactsReadiness,
  ORGANIZATION_ARTIFACT_LABELS,
} from "@/operations/artifacts";

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
    getOrganizationArtifactsReadiness(organizationId),
  ]);
  const pathname = (await headers()).get("x-coznt-pathname") ?? "";
  const standardsManagementRoute = pathname.startsWith("/settings/standards");

  if (!standardsReadiness.requiredComplete && !standardsManagementRoute) {
    return (
      <OrgStandardsOnboardingWizard
        orgName={orgName}
        missingRequiredLabels={standardsReadiness.missingRequired.map(
          (kind) => ORGANIZATION_ARTIFACT_LABELS[kind],
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
