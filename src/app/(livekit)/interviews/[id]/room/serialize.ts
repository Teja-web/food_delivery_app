/**
 * Interview room serialization.
 * Types flow from: DB schema → serialize → InterviewRoom client component.
 */

import type { RoomConnectionDetails, ParticipantRole } from "@/operations/livekit";
import type { InterviewPrep } from "@/db/schema/intelligence";

// -- Live assessment types ------------------------------------------

export interface RoomAssessmentData {
  attemptId: string;
  assessmentId: string;
  title: string;
  status: string;
  questions: Array<{ id: string; text: string; type: string; order: number | null; options: unknown }>;
  existingAnswers: Record<string, string>;
  deadlineAt: string | null;
  startedAt: string | null;
}

export interface RoomAssessmentLauncher {
  availableAssessments: Array<{ id: string; title: string; type: string | null; questionCount: number }>;
  activeAttempts: Array<{
    attemptId: string;
    title: string;
    status: string;
    answeredCount: number;
    totalQuestions: number;
    deadlineAt: string | null;
  }>;
}

// -- Sidebar data types ---------------------------------------------

export interface RoomInfoTab {
  roleName: string | null;
  roleDescription: string | null;
  candidateName: string | null;
  candidateTitle: string | null;
  scheduledAt: string | null;
  durationMins: number | null;
}

export interface RoomGuideTab {
  prep: InterviewPrep | null;
}

export interface RoomFeedbackTab {
  interviewId: string;
  competencies: string[];
  existingRatings: Array<{
    competency: string;
    rating: number;
    evidence: string;
  }>;
}

// -- Room page props ------------------------------------------------

export interface InterviewRoomProps {
  connection: RoomConnectionDetails;
  sidebar: {
    info: RoomInfoTab;
    guide: RoomGuideTab;
    feedback: RoomFeedbackTab;
    assessment: RoomAssessmentLauncher;
  } | null; // null for candidates (no sidebar)
  interviewId: string;
  interviewStatus: string;
  initialRecordingStatus: string;
  proctored: boolean;
  assessments: RoomAssessmentData[];
}

// -- Serializer -----------------------------------------------------

export function serializeInterviewRoom(opts: {
  connection: RoomConnectionDetails;
  interview: {
    id: string;
    status: string;
    scheduledAt: Date | null;
    durationMins: number | null;
    recordingStatus: string | null;
    proctored: boolean;
  };
  role?: { title: string | null; description: string | null } | null;
  candidate?: { name: string | null; title: string | null } | null;
  prep: InterviewPrep | null;
  competencies: string[];
  existingRatings: Array<{ competency: string; rating: number; evidence: string }>;
  assessments: RoomAssessmentData[];
  assessmentLauncher: RoomAssessmentLauncher | null;
}): InterviewRoomProps {
  const isCandidateView = opts.connection.participantRole === "candidate";

  return {
    connection: opts.connection,
    interviewId: opts.interview.id,
    interviewStatus: opts.interview.status,
    initialRecordingStatus: opts.interview.recordingStatus ?? "none",
    proctored: opts.interview.proctored,
    assessments: opts.assessments,
    sidebar: isCandidateView
      ? null
      : {
          info: {
            roleName: opts.role?.title ?? null,
            roleDescription: opts.role?.description ?? null,
            candidateName: opts.candidate?.name ?? null,
            candidateTitle: opts.candidate?.title ?? null,
            scheduledAt: opts.interview.scheduledAt?.toISOString() ?? null,
            durationMins: opts.interview.durationMins,
          },
          guide: {
            prep: opts.prep,
          },
          feedback: {
            interviewId: opts.interview.id,
            competencies: opts.competencies,
            existingRatings: opts.existingRatings,
          },
          assessment: opts.assessmentLauncher ?? { availableAssessments: [], activeAttempts: [] },
        },
  };
}
