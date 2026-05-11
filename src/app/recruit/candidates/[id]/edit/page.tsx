import { notFound } from "next/navigation";
import { fetchCandidate } from "@/actions/candidates";
import EditCandidateClient from "./EditCandidateClient";
import type { CandidateFormData } from "../../CandidateForm";

function candidateToFormData(candidate: any): CandidateFormData {
  return {
    name: candidate.name ?? "",
    email: candidate.email ?? "",
    phone: candidate.phone ?? "",
    title: candidate.title ?? "",
    company: candidate.company ?? "",
    location: candidate.location ?? "",
    source: candidate.source ?? "",
    resumeText: candidate.resumeText ?? "",
  };
}

export default async function EditCandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidate = await fetchCandidate(id);
  if (!candidate) return notFound();

  const initialData = candidateToFormData(candidate);

  return (
    <EditCandidateClient
      candidateId={id}
      candidateName={candidate.name}
      initialData={initialData}
    />
  );
}
