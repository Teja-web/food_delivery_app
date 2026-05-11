import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { roles } from "@/db/schema";
import { getPublicOpportunity } from "@/operations/public";
import type { PublicRoleDTO } from "@/lib/anonymize";
import { DashboardClient, type RevealRole } from "./dashboard-client";

interface PageProps {
  searchParams: Promise<{ reveal?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const slug = params.reveal?.trim();

  let reveal: RevealRole | null = null;
  if (slug) {
    const [dto, roleRows] = await Promise.all([
      getPublicOpportunity(slug),
      db
        .select({ id: roles.id })
        .from(roles)
        .where(
          and(eq(roles.publicSlug, slug), ne(roles.publicVisibility, "private")),
        )
        .limit(1),
    ]);
    if (dto && roleRows[0]) {
      reveal = { dto: dto as PublicRoleDTO, jobId: roleRows[0].id };
    }
  }

  return <DashboardClient reveal={reveal} />;
}
