import { getPortalCandidateContext } from "@/operations/portal";
import { CoachClient } from "./coach-client";

export default async function CoachHome() {
  const candidate = await getPortalCandidateContext();

  const candidateProfileJson =
    (candidate.profile?.candidate?.profile ?? {}) as Record<string, unknown>;
  const firstName = candidate.name.split(" ")[0] || "there";

  const advisory =
    (candidate.advisory?.advisory as unknown as Record<string, unknown>) ?? null;
  const intelligenceProfile =
    (candidate.advisory?.profile as unknown as Record<string, unknown>) ?? null;

  const candidateId = candidate.candidateId ?? "";

  const now = new Date();
  const upcomingInterviews = candidate.interviews
    .map((iv) => {
      const r = iv as Record<string, unknown>;
      return {
        id: r.interviewId as string,
        jobId: (r.jobId as string) ?? "",
        jobTitle: (r.jobTitle as string) ?? "Role",
        scheduledAt: iv.scheduledAt
          ? new Date(iv.scheduledAt as unknown as string).toISOString()
          : "",
        durationMins: (r.durationMins as number) ?? 45,
        status: (r.status as string) ?? "",
        meetingLink: (r.meetingLink as string) ?? null,
        candidateToken: (r.candidateToken as string) ?? null,
      };
    })
    .filter((iv) => {
      const scheduled = iv.scheduledAt ? new Date(iv.scheduledAt) : null;
      return (
        scheduled &&
        scheduled > now &&
        !["cancelled", "completed", "no_show"].includes(iv.status)
      );
    })
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    )
    .slice(0, 3);

  const offerApplications = candidate.applications
    .filter((opp) => opp.stage === "offer")
    .map((opp) => ({
      applicationId: opp.applicationId,
      jobId: opp.jobId,
      jobTitle: opp.jobTitle ?? "Role",
      orgName: opp.orgName ?? null,
    }));

  return (
    <CoachClient
      firstName={firstName}
      advisory={advisory}
      intelligenceProfile={intelligenceProfile}
      skills={(candidateProfileJson.skills as string[]) ?? []}
      candidateId={candidateId}
      hasResume={candidate.hasResume}
      upcomingInterviews={upcomingInterviews}
      offerApplications={offerApplications}
    />
  );
}
