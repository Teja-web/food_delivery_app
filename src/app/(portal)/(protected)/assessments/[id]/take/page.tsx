import { redirect } from "next/navigation";
import { fetchPortalAttempt } from "@/actions/portal";
import { AssessmentTakeClient } from "./assessment-take-client";

export default async function AssessmentTakePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: attemptId } = await params;

  let attempt;
  try {
    attempt = await fetchPortalAttempt(attemptId);
  } catch {
    redirect("/assessments");
  }

  if (!attempt) {
    redirect("/assessments");
  }

  if (attempt.status === "completed" || attempt.status === "submitted" || attempt.status === "evaluated") {
    redirect(`/assessments/${attemptId}/results`);
  }

  const assessment = attempt.assessment as Record<string, unknown>;
  const questions = attempt.questions ?? [];

  return (
    <AssessmentTakeClient
      attemptId={attemptId}
      title={(assessment?.title as string) ?? "Assessment"}
      type={(assessment?.type as string) ?? ""}
      description={(assessment?.description as string | null) ?? null}
      questions={questions}
      existingAnswers={(attempt.answers as Record<string, string>) ?? {}}
    />
  );
}
