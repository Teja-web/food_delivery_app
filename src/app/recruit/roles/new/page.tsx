"use client";

import { useRouter } from "next/navigation";
import { addRole } from "@/actions/roles";
import RoleWizardForm, { EMPTY_FORM, type RoleFormData } from "../RoleWizardForm";

export default function NewRolePage() {
  const router = useRouter();

  const handleSubmit = async (form: RoleFormData) => {
    const role = await addRole({
      title: form.title,
      department: form.department || undefined,
      team: form.team || undefined,
      hiringManagerId: form.hiringManager || undefined,
      recruiterId: form.recruiter || undefined,
      location: form.location || undefined,
      headcount: form.headcount,
      compensation: form.compensation.min != null ? form.compensation : undefined,
      employmentType: form.employmentType || undefined,
      targetHireDate: form.targetHireDate || undefined,
      description: form.description || undefined,
      businessCase: form.businessCase || undefined,
      criteriaConfig: form.competencies.length > 0 ? {
        criteria: form.competencies.map((c) => ({
          category: "competency",
          name: c.name,
          description: c.name,
          weight: c.weight === "Required" ? "critical" as const : c.weight === "Preferred" ? "important" as const : "nice_to_have" as const,
        })),
        keywords: [],
      } : undefined,
      vendorVisibility: form.vendorVisibility,
      exclusiveVendorOrgId: form.vendorVisibility === "exclusive" ? form.exclusiveVendorOrgId : null,
      status: "open",
    }, form.interviewStages.length > 0 ? form.interviewStages.map((s) => ({
      name: s.name,
      durationMins: s.durationMins,
      competencies: s.competencies,
    })) : undefined);
    router.push(`/recruit/roles/${(role as any).id}`);
  };

  return (
    <RoleWizardForm
      initialData={EMPTY_FORM}
      initialCompletedSteps={new Set()}
      onSubmit={handleSubmit}
      heading="Open a new role"
      subheading="Define the opportunity, set criteria, and configure the interview plan. The system will start matching candidates immediately."
      backHref="/recruit/roles"
      backLabel="Open Roles"
      submitLabel="Open role & start matching"
      submittingLabel="Creating..."
    />
  );
}
