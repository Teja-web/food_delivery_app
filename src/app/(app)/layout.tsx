import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell/AppShell";
import { db } from "@/db/client";
import { organization } from "@/db/schema/auth";
import { getCurrentUser } from "@/lib/auth/actions";

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

  const orgName = await getOrgName(organizationId);

  return (
    <AppShell user={currentUser} role={role} orgName={orgName}>
      {children}
    </AppShell>
  );
}
