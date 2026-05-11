import { notFound } from "next/navigation";
import {
  fetchPortalRoleDetail,
  fetchPortalPrepHistory,
} from "@/actions/portal";
import { RoleResultsClient } from "./role-results-client";

export default async function RoleResultsPage({
  params,
}: {
  params: Promise<{ roleId: string }>;
}) {
  const { roleId } = await params;

  const [role, prepHistory] = await Promise.all([
    fetchPortalRoleDetail(roleId),
    fetchPortalPrepHistory(),
  ]);
  if (!role) notFound();

  // Prep session scores for this role
  const rolePrepSessions = (prepHistory ?? [])
    .filter((s) => s.roleId === roleId || s.interviewId != null)
    .map((s) => ({
      id: s.id,
      type: s.type,
      createdAt: s.createdAt as unknown as string,
      score: s.score ?? null,
      summary: s.summary ?? null,
    }));

  return (
    <RoleResultsClient
      prepSessions={rolePrepSessions}
    />
  );
}
