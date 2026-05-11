import { notFound } from "next/navigation";
import { fetchRoleDetail } from "@/actions/roles";
import EditRoleClient from "./EditRoleClient";
import type { RoleFormData } from "../../RoleWizardForm";
import type { RoleCompensation, RoleCriteriaConfig } from "@/db/schema/roles";

function roleToFormData(role: any): RoleFormData {
  const comp = (role.compensation as RoleCompensation | null) ?? ({} as Partial<RoleCompensation>);
  const criteria = (role.criteriaConfig as RoleCriteriaConfig | null);
  const stages = (role.interviewStages ?? []).sort((a: any, b: any) => a.order - b.order);

  return {
    title: role.title ?? "",
    department: role.department ?? "",
    team: role.team ?? "",
    hiringManager: role.hiringManagerId ?? "",
    recruiter: role.recruiterId ?? "",
    location: role.location ?? "",
    headcount: role.headcount ?? 1,
    compensation: {
      min: comp.min ?? null,
      max: comp.max ?? null,
      currency: comp.currency ?? null,
      equity: comp.equity ?? null,
      bonus: comp.bonus ?? null,
    },
    employmentType: role.employmentType ?? "Full-time",
    targetHireDate: role.targetHireDate
      ? new Date(role.targetHireDate).toISOString().slice(0, 10)
      : "",
    businessCase: role.businessCase ?? "",
    description: role.description ?? "",
    competencies: criteria?.criteria?.map((c) => ({
      name: c.name,
      weight: c.weight === "critical" ? "Required" : c.weight === "important" ? "Preferred" : "Nice to have",
    })) ?? [],
    mustHaves: "",
    niceToHaves: "",
    interviewStages: stages.map((s: any) => ({
      name: s.name,
      interviewer: "",
      durationMins: s.durationMins,
      competencies: s.competencies ?? [],
      assessment: null,
    })),
    vendorVisibility: (role.vendorVisibility ?? "internal") as RoleFormData["vendorVisibility"],
    exclusiveVendorOrgId: role.exclusiveVendorOrgId ?? null,
  };
}

export default async function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await fetchRoleDetail(id);
  if (!role) return notFound();

  const initialData = roleToFormData(role);

  return <EditRoleClient roleId={id} roleTitle={role.title} initialData={initialData} />;
}
