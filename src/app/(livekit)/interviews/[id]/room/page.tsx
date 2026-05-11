import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { interviews, assessments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/actions";
import {
  joinRoomAsUser,
  joinRoomByInviteToken,
  isRoomOpen,
} from "@/operations/livekit";
import { getInterviewLiveAttempts } from "@/operations/assessments";
import { serializeInterviewRoom } from "./serialize";
import { InterviewRoom } from "./InterviewRoom";
import type { ScorecardRatingEntry } from "@/db/schema/interviews";
import type { InterviewPrep } from "@/db/schema/intelligence";
import type { RoomAssessmentData } from "./serialize";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function InterviewRoomPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { token: inviteToken } = await searchParams;

  // Fetch interview with relations for sidebar data
  const interview = await db.query.interviews.findFirst({
    where: eq(interviews.id, id),
    with: {
      application: { with: { candidate: true, role: true } },
      stage: true,
      scorecards: true,
      intelligence: true,
      panelists: true,
    },
  });

  if (!interview) {
    redirect("/recruit/interviews");
  }

  // Check room availability window
  if (!isRoomOpen(interview.scheduledAt, interview.durationMins)) {
    redirect(`/recruit/interviews/${id}`);
  }

  // -- Auth: session or invite token ------------------------------
  let connection;
  console.log("[room] inviteToken:", inviteToken ? "present" : "missing");

  try {
    if (inviteToken) {
      // Path 2: invite token for external participants
      connection = await joinRoomByInviteToken(id, inviteToken);
    } else {
      // Path 1: logged-in user
      const userContext = await getCurrentUser();
      if (!userContext?.currentUser) {
        redirect(`/login?callbackUrl=/interviews/${id}/room`);
      }
      connection = await joinRoomAsUser(
        id,
        userContext.currentUser.id,
        userContext.currentUser.name,
        userContext.currentUser.email,
      );
    }
  } catch (error) {
    console.error("[room] join error:", error);
    const message = error instanceof Error ? error.message : "Unable to join interview";
    const errorRedirect = inviteToken ? `/coach` : `/recruit/interviews/${id}`;
    redirect(`${errorRedirect}?error=${encodeURIComponent(message)}`);
  }

  // -- Build sidebar data ------------------------------------------

  // Fallback to role criteria if stage competencies are empty
  const stageCompetencies = interview.stage?.competencies ?? [];
  const roleCriteria = interview.application?.role?.criteriaConfig as { criteria?: { name: string }[] } | null;
  const competencies = stageCompetencies.length > 0
    ? stageCompetencies
    : (roleCriteria?.criteria?.map((c) => c.name) ?? []);
  // Filter to show only the current user's scorecard ratings
  const currentUserId = connection.participantIdentity;
  const userScorecard = (interview.scorecards ?? []).find(
    (sc) => sc.reviewerId === currentUserId
  );
  const existingRatings = userScorecard
    ? ((userScorecard.ratings as ScorecardRatingEntry[]) ?? []).map((r) => ({
        competency: r.competency,
        rating: r.rating,
        evidence: r.evidence,
      }))
    : [];

  // -- Assessment data -----------------------------------------
  const liveAttempts = await getInterviewLiveAttempts(id);
  const assessmentData: RoomAssessmentData[] = liveAttempts.map((a) => ({
    attemptId: a.attemptId,
    assessmentId: a.assessmentId,
    title: a.title,
    status: a.status,
    questions: a.questions,
    existingAnswers: a.existingAnswers,
    deadlineAt: a.deadlineAt,
    startedAt: a.startedAt,
  }));

  // For panelists: fetch available org assessments for the launcher
  let assessmentLauncher = null;
  if (connection.participantRole === "panelist" && interview.organizationId) {
    const orgAssessments = await db.query.assessments.findMany({
      where: and(
        eq(assessments.organizationId, interview.organizationId),
        eq(assessments.status, "active"),
      ),
      with: { questions: true },
    });
    assessmentLauncher = {
      availableAssessments: orgAssessments.map((a) => ({
        id: a.id,
        title: a.title,
        type: a.type,
        questionCount: a.questions?.length ?? 0,
      })),
      activeAttempts: liveAttempts.map((a) => ({
        attemptId: a.attemptId,
        title: a.title,
        status: a.status,
        answeredCount: a.answeredCount,
        totalQuestions: a.totalQuestions,
        deadlineAt: a.deadlineAt,
      })),
    };
  }

  const props = serializeInterviewRoom({
    connection,
    interview: {
      id: interview.id,
      status: interview.status,
      scheduledAt: interview.scheduledAt,
      durationMins: interview.durationMins,
      recordingStatus: interview.recordingStatus,
      proctored: interview.proctored,
    },
    role: interview.application?.role
      ? { title: interview.application.role.title, description: interview.application.role.description ?? null }
      : null,
    candidate: interview.application?.candidate
      ? { name: interview.application.candidate.name, title: interview.application.candidate.title ?? null }
      : null,
    prep: (interview.intelligence?.prep as InterviewPrep) ?? null,
    competencies,
    existingRatings,
    assessments: assessmentData,
    assessmentLauncher,
  });

  return <InterviewRoom {...props} />;
}
