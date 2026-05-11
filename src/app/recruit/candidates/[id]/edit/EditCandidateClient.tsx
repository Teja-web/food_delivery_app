"use client";

import { useRouter } from "next/navigation";
import { editCandidate } from "@/actions/candidates";
import CandidateForm, { type CandidateFormData } from "../../CandidateForm";

export default function EditCandidateClient({
  candidateId,
  candidateName,
  initialData,
}: {
  candidateId: string;
  candidateName: string;
  initialData: CandidateFormData;
}) {
  const router = useRouter();

  const handleSubmit = async (form: CandidateFormData) => {
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      email: form.email.trim(),
    };
    if (form.phone.trim()) payload.phone = form.phone.trim();
    if (form.title.trim()) payload.title = form.title.trim();
    if (form.company.trim()) payload.company = form.company.trim();
    if (form.location.trim()) payload.location = form.location.trim();
    if (form.source) payload.source = form.source;
    if (form.resumeText.trim()) payload.resumeText = form.resumeText.trim();

    await editCandidate(candidateId, payload);
    router.push(`/recruit/candidates/${candidateId}`);
  };

  return (
    <CandidateForm
      initialData={initialData}
      onSubmit={handleSubmit}
      heading={`Edit ${candidateName}`}
      subheading="Update candidate details. Changes will be reflected in all active pipelines."
      backHref={`/recruit/candidates/${candidateId}`}
      backLabel={candidateName}
      submitLabel="Save changes"
      submittingLabel="Saving..."
      showResumeUpload={!initialData.resumeText}
    />
  );
}
