import type { Interview, InterviewStage, ProposedSlot } from "@/db/schema/interviews";

interface InterviewWithRelations extends Interview {
  application: {
    role: { title: string } | null;
    candidate: { name: string; email: string | null } | null;
  } | null;
  stage: InterviewStage | null;
  panelists: { userId: string; role: string; user: { name: string; image: string | null } | null }[];
}

export interface PortalInterviewProps {
  id: string;
  status: string;
  roleName: string;
  stageName: string;
  candidateName: string;
  interviewType: string | null;
  scheduledAt: string | null;
  durationMins: number | null;
  proposedSlots: ProposedSlot[];
  panelistNames: string[];
  meetingLink: string | null;
  location: string | null;
  notes: string | null;
}

export function serializePortalInterview(interview: InterviewWithRelations): PortalInterviewProps {
  const durationMins = interview.durationMins ?? 45;
  let proposedSlots = interview.proposedSlots ?? [];

  // If no proposed slots but scheduledAt exists, create a slot from it
  if (proposedSlots.length === 0 && interview.scheduledAt) {
    const startAt = new Date(interview.scheduledAt);
    const endAt = new Date(startAt.getTime() + durationMins * 60 * 1000);
    proposedSlots = [{ startAt: startAt.toISOString(), endAt: endAt.toISOString() }];
  }

  return {
    id: interview.id,
    status: interview.status,
    roleName: interview.application?.role?.title ?? "Interview",
    stageName: interview.stage?.name ?? "Interview",
    candidateName: interview.application?.candidate?.name ?? "Candidate",
    interviewType: interview.interviewType,
    scheduledAt: interview.scheduledAt ? new Date(interview.scheduledAt).toISOString() : null,
    durationMins,
    proposedSlots,
    panelistNames: interview.panelists
      ?.map((p) => p.user?.name)
      .filter((n): n is string => !!n) ?? [],
    meetingLink: interview.meetingLink,
    location: interview.location,
    notes: interview.notes,
  };
}
