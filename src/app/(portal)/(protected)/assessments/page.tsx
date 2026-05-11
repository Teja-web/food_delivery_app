import { fetchPortalAssessments } from "@/actions/portal";
import { AssessmentsListClient } from "@/components/portal/assessments-list-client";

export default async function AssessmentsPage() {
  const { assigned, available } = await fetchPortalAssessments();

  const assessmentsAssigned = assigned.map((a: any) => ({
    attemptId: a.id,
    assessmentId: a.assessmentId,
    title: a.assessment?.title ?? "Assessment",
    type: a.assessment?.type ?? null,
    origin: a.assessment?.origin ?? "org_created",
    status: a.status,
    score: a.score,
    deadlineAt: a.deadlineAt ? new Date(a.deadlineAt).toISOString() : null,
    createdAt: new Date(a.createdAt).toISOString(),
  }));

  const assessmentsAvailable = available.map((a: any) => ({
    assessmentId: a.id,
    title: a.title,
    type: a.type,
    description: a.description,
  }));

  return (
    <AssessmentsListClient
      assigned={assessmentsAssigned}
      available={assessmentsAvailable}
      basePath="/assessments"
    />
  );
}
