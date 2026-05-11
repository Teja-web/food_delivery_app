import { notFound } from "next/navigation";
import { fetchInterview } from "@/actions/interviews";
import ScheduleInterviewForm from "../../new/ScheduleInterviewForm";
import type { InterviewInitialData } from "../../new/ScheduleInterviewForm";

export default async function EditInterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const interview = await fetchInterview(id);
  if (!interview) return notFound();

  const iv = interview as any;

  const initialData: InterviewInitialData = {
    interviewId: id,
    interviewType: iv.interviewType,
    durationMins: iv.durationMins,
    meetingLink: iv.meetingLink,
    location: iv.location,
    evidenceTarget: iv.evidenceTarget,
    notes: iv.notes,
    status: iv.status ?? "proposed",
    proctored: iv.proctored ?? false,
    proposedSlots: iv.proposedSlots ?? null,
    panelistUserIds: (iv.panelists ?? []).map((p: any) => p.userId),
  };

  return (
    <ScheduleInterviewForm
      applicationId={iv.applicationId}
      stageId={iv.stageId ?? ""}
      roleId={iv.application?.roleId ?? iv.roleId ?? ""}
      initialData={initialData}
    />
  );
}
