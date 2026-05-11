import { notFound } from "next/navigation";
import { fetchPortalInterviewsForRole, fetchPortalRoleDetail } from "@/actions/portal";
import { serializeInterviews } from "@/app/(portal)/(protected)/interviews/serialize";
import { RoleInterviewsClient } from "./role-interviews-client";

export default async function RoleInterviewsPage({
  params,
}: {
  params: Promise<{ roleId: string }>;
}) {
  const { roleId } = await params;
  const [role, rows] = await Promise.all([
    fetchPortalRoleDetail(roleId),
    fetchPortalInterviewsForRole(roleId),
  ]);
  if (!role) notFound();

  const grouped = serializeInterviews(rows ?? []);

  return <RoleInterviewsClient interviews={grouped} roleId={roleId} />;
}
