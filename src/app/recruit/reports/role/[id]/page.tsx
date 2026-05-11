import { generateRoleReport, fetchRoleDetail } from "@/actions/roles";
import { notFound } from "next/navigation";
import { RoleReportView } from "./RoleReportView";

export default async function RoleReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const role = await fetchRoleDetail(id);
  if (!role) notFound();

  const report = await generateRoleReport(id);

  return (
    <RoleReportView
      roleId={id}
      roleTitle={role.title}
      department={role.department ?? undefined}
      report={report}
    />
  );
}
