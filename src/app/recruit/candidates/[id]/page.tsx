import { notFound } from "next/navigation";
import { fetchCandidateDetail } from "@/actions/candidates";
import { fetchTriageItemsForEntity } from "@/actions/triage";
import { fetchEntityNotes } from "@/actions/entity-notes";
import { serializeCandidateDetail } from "./serialize";
import CandidateProfileClient from "./CandidateProfileClient";

export default async function CandidateProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [result, activityLog, notes] = await Promise.all([
    fetchCandidateDetail(id),
    fetchTriageItemsForEntity("candidate", id),
    fetchEntityNotes("candidate", id),
  ]);
  if (!result) return notFound();

  const serializedNotes = notes.map((n) => ({
    id: n.id,
    body: n.body,
    createdByName: n.createdByName,
    createdAt: n.createdAt,
  }));

  const props = serializeCandidateDetail({ ...result, activityLog, notes: serializedNotes });

  return <CandidateProfileClient {...props} />;
}
