import { notFound } from "next/navigation";
import { fetchAssessment } from "@/actions/assessments";
import { serializeAssessmentDetail } from "../serialize";
import AssessmentEditClient from "./AssessmentEditClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AssessmentEditPage({ params }: Props) {
  const { id } = await params;

  const assessment = await fetchAssessment(id);

  if (!assessment) {
    notFound();
  }

  const props = serializeAssessmentDetail(assessment as any);

  return <AssessmentEditClient {...props} />;
}
