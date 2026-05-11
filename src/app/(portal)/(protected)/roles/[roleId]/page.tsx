import { notFound } from "next/navigation";
import { fetchPortalRoleDetail } from "@/actions/portal";
import { serializeRoleDetail } from "./serialize";
import { RoleOverviewClient } from "./role-overview-client";

export default async function RoleOverviewPage({
  params,
}: {
  params: Promise<{ roleId: string }>;
}) {
  const { roleId } = await params;
  const raw = await fetchPortalRoleDetail(roleId);
  if (!raw) notFound();

  const role = serializeRoleDetail(raw);

  return <RoleOverviewClient role={role} roleId={roleId} />;
}
