"use client";

import { useRouter } from "next/navigation";
import { editRole } from "@/actions/roles";
import RoleWizardForm, { type RoleFormData } from "../../RoleWizardForm";

const ALL_STEPS = new Set(["Basics", "Criteria", "Interview Plan", "Review"] as const);

export default function EditRoleClient({
  roleId,
  roleTitle,
  initialData,
}: {
  roleId: string;
  roleTitle: string;
  initialData: RoleFormData;
}) {
  const router = useRouter();

  const handleSubmit = async (form: RoleFormData) => {
    await editRole(roleId, {
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
    }, form.interviewStages.map((s) => ({
      name: s.name,
      durationMins: s.durationMins,
      competencies: s.competencies,
    })));
    router.push(`/recruit/roles/${roleId}`);
  };

  return (
    <RoleWizardForm
      initialData={initialData}
      initialCompletedSteps={ALL_STEPS as any}
      onSubmit={handleSubmit}
      heading={`Edit ${roleTitle}`}
      subheading="Update role details, criteria, or interview plan. Changes will be reflected in future candidate matching."
      backHref={`/recruit/roles/${roleId}`}
      backLabel={roleTitle}
      submitLabel="Save changes"
      submittingLabel="Saving..."
    />
  );
}
