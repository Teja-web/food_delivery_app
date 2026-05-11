import { notFound } from "next/navigation";
import { fetchAssessment } from "@/actions/assessments";
import { serializeAssessmentDetail } from "./serialize";
import AssessmentDetailView from "./AssessmentDetailView";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AssessmentDetailPage({ params }: Props) {
  const { id } = await params;

  const assessment = await fetchAssessment(id);

  if (!assessment) {
    notFound();
  }

  const props = serializeAssessmentDetail(assessment as any);

  return <AssessmentDetailView {...props} />;
}
