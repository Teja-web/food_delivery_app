import { fetchInterview } from "@/actions/interviews";
import { fetchTriageItemsForEntity } from "@/actions/triage";
import { notFound } from "next/navigation";
import { serializeInterviewDetail } from "./serialize";
import InterviewDetailClient from "./InterviewDetailClient";
import { getActionContext } from "@/lib/auth/context";

export default async function InterviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const [interview, ctx] = await Promise.all([
    fetchInterview(id),
    getActionContext(),
  ]);

  if (!interview) notFound();

  // Fetch activity log for this interview
  const activityLog = await fetchTriageItemsForEntity("interview", id);

  const props = serializeInterviewDetail(interview as any, activityLog);

  return <InterviewDetailClient {...props} currentUserId={ctx.userId} errorMessage={error} />;
}
