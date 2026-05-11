/**
 * Serialize portal interview rows for client consumption.
 * Strips internal-only fields (red flags, panel health, scorecard details).
 */

type InterviewRow = {
  interviewId: string;
  applicationId: string;
  scheduledAt: Date | null;
  status: string | null;
  meetingLink: string | null;
  location: string | null;
  durationMins: number | null;
  proposedSlots: unknown;
  candidateToken: string | null;
  jobId: string;
  jobTitle: string;
  organizationId: string;
  candidateId: string;
  evaluation: unknown;
};

export type SerializedInterview = ReturnType<typeof serializeInterview>;

function serializeInterview(row: InterviewRow, now: Date) {
  const scheduledAt = row.scheduledAt ? new Date(row.scheduledAt) : null;
  const durationMins = row.durationMins ?? 45;

  // Room opens 15min before, closes 30min after end
  let isJoinable = false;
  if (scheduledAt && row.status === "confirmed") {
    const opensAt = new Date(scheduledAt.getTime() - 15 * 60_000);
    const closesAt = new Date(scheduledAt.getTime() + (durationMins + 30) * 60_000);
    isJoinable = now >= opensAt && now <= closesAt;
  }

  // Room URL — only include when joinable
  const roomUrl =
    isJoinable && row.candidateToken
      ? `/interviews/${row.interviewId}/room?token=${row.candidateToken}`
      : null;

  // Candidate-safe evaluation summary (omit red flags, panel internals)
  let evaluationSummary: {
    keyInsights: string[];
    standoutMoments: string[];
    topicsDiscussed: string[];
    competencyScores: Array<{ competency: string; score: number }>;
    assessmentParagraph: string | null;
  } | null = null;

  if (row.evaluation && typeof row.evaluation === "object" && row.status === "completed") {
    const ev = row.evaluation as Record<string, unknown>;
    const transcriptScores = (ev.transcriptCompetencyScores ?? []) as Array<{
      competency: string;
      score: number;
    }>;
    evaluationSummary = {
      keyInsights: (ev.keyInsights as string[]) ?? [],
      standoutMoments: (ev.standoutMoments as string[]) ?? [],
      topicsDiscussed: (ev.topicsDiscussed as string[]) ?? [],
      competencyScores: transcriptScores.map((s) => ({
        competency: s.competency,
        score: s.score,
      })),
      assessmentParagraph: (ev.assessmentParagraph as string) ?? null,
    };
  }

  return {
    id: row.interviewId,
    jobTitle: row.jobTitle,
    status: row.status ?? "proposed",
    scheduledAt: scheduledAt?.toISOString() ?? null,
    durationMins,
    location: row.location,
    meetingLink: row.meetingLink,
    isJoinable,
    roomUrl,
    evaluationSummary,
    prepUrl: `/prep?interview=${row.interviewId}`,
  };
}

export type InterviewGroup = "live" | "upcoming" | "pending" | "past";

export function serializeInterviews(rows: InterviewRow[]) {
  const now = new Date();
  const serialized = rows.map((r) => serializeInterview(r, now));

  const live: SerializedInterview[] = [];
  const upcoming: SerializedInterview[] = [];
  const pending: SerializedInterview[] = [];
  const past: SerializedInterview[] = [];

  for (const iv of serialized) {
    if (iv.isJoinable) {
      live.push(iv);
    } else if (iv.status === "confirmed" && iv.scheduledAt && new Date(iv.scheduledAt) > now) {
      upcoming.push(iv);
    } else if (iv.status === "proposed") {
      pending.push(iv);
    } else {
      past.push(iv);
    }
  }

  return { live, upcoming, pending, past };
}
