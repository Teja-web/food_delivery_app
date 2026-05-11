import {
  fetchPortalOpportunities,
  fetchPortalPastApplications,
  fetchPortalCandidateMatches,
  fetchCandidateApplicationJobs,
  fetchPortalProfile,
  fetchPortalInterviews,
} from "@/actions/portal";
import { RolesClient } from "./roles-client";
import { serializePortalApplications } from "./serialize";

function parseDimension(raw: unknown): { score: number; reasoning: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.score !== "number") return null;
  return { score: obj.score, reasoning: (obj.reasoning as string) ?? "" };
}

export default async function RolesPage() {
  const [opportunities, pastApps, matches, existingApps, profile, interviews] =
    await Promise.all([
      fetchPortalOpportunities(),
      fetchPortalPastApplications(),
      fetchPortalCandidateMatches().catch(() => null),
      fetchCandidateApplicationJobs(),
      fetchPortalProfile(),
      fetchPortalInterviews(),
    ]);

  // -- Discover roles ------------------------------------------
  const applicationJobIds = new Set(
    (existingApps ?? []).map((a) => (a as Record<string, unknown>).jobId as string)
  );
  const portalStages = new Set(["new", "interested"]);
  const interestedJobIds = new Set(
    (existingApps ?? [])
      .filter((a) => portalStages.has((a as Record<string, unknown>).stage as string))
      .map((a) => (a as Record<string, unknown>).jobId as string)
  );

  const profileData = profile as Record<string, unknown> | null;
  const candidateRecord = profileData?.candidate as Record<string, unknown> | null;
  const candidateProfile = candidateRecord?.profile as Record<string, unknown> | undefined;
  const candidateIntelligence = candidateRecord?.intelligence as Record<string, unknown> | undefined;
  const hasResume = !!(profileData?.resumeUrl || profileData?.resumeText);
  // Check profile completeness from intelligence, or fall back to resume/skills check
  const profileCompleteness = (candidateIntelligence?.profileCompleteness as number) ?? 0;
  const hasProfile = profileCompleteness >= 50 || hasResume || !!((candidateProfile?.skills as string[])?.length || (candidateProfile?.currentTitle as string));

  const matchesArray = (matches && "matches" in matches ? matches.matches : matches) ?? [];
  const roles = matchesArray
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .map((m) => ({
      jobId: m.jobId,
      title: m.jobTitle,
      department: m.jobDepartment,
      description: m.jobDescription,
      location: m.jobLocation,
      employmentType: (m as any).employmentType ?? null,
      comp: m.jobComp as Record<string, unknown> | null,
      profile: (m as any).profile as Record<string, unknown> | null,
      orgName: (m as any).orgName as string | null ?? null,
      score: m.fitScore ?? 0,
      signal: m.signal as string | null ?? null,
      hasApplication: applicationJobIds.has(m.jobId),
      hasInterest: interestedJobIds.has(m.jobId),
    }));

  // -- Applications (same match data as recruiter side) --------
  const allInterviews = (interviews ?? []).map((iv) => ({
    interviewId: iv.interviewId ?? "",
    applicationId: iv.applicationId ?? "",
    candidateToken: iv.candidateToken ?? null,
    scheduledAt: iv.scheduledAt,
    durationMins: iv.durationMins ?? null,
    status: iv.status ?? "",
    meetingLink: iv.meetingLink ?? null,
  }));
  const applications = serializePortalApplications(opportunities ?? [], allInterviews);

  // -- Past applications (rejected, withdrawn, declined offers) --
  const pastApplications = (pastApps ?? []).map((app) => ({
    applicationId: app.applicationId,
    jobId: app.jobId,
    jobTitle: app.jobTitle,
    jobLocation: app.jobLocation ?? null,
    orgName: app.orgName ?? null,
    stage: app.stage,
    offerStatus: app.offerStatus ?? null,
    updatedAt: app.updatedAt ? new Date(app.updatedAt as unknown as string).toISOString() : null,
  }));

  // -- Pending interviews (need candidate to accept) -----------
  const pendingInterviews = (interviews ?? [])
    .filter((iv) => iv.status === "proposed")
    .map((iv) => {
      const durationMins = iv.durationMins ?? 45;
      let slots = (iv.proposedSlots ?? []) as Array<{ startAt: string; endAt: string }>;

      // If no proposed slots but scheduledAt exists, create a slot from it
      if (slots.length === 0 && iv.scheduledAt) {
        const startAt = new Date(iv.scheduledAt as unknown as string);
        const endAt = new Date(startAt.getTime() + durationMins * 60 * 1000);
        slots = [{ startAt: startAt.toISOString(), endAt: endAt.toISOString() }];
      }

      return {
        id: iv.interviewId ?? "",
        jobTitle: iv.jobTitle ?? "Role",
        durationMins,
        location: iv.location ?? null,
        proposedSlots: slots,
        candidateToken: iv.candidateToken ?? "",
      };
    });

  // -- Completed interviews ------------------------------------
  const COMPLETED_STATUSES = new Set(["completed", "evaluated"]);
  const completedInterviews = (interviews ?? [])
    .filter((iv) => COMPLETED_STATUSES.has(iv.status ?? ""))
    .sort((a, b) => {
      const aDate = new Date(a.scheduledAt as unknown as string);
      const bDate = new Date(b.scheduledAt as unknown as string);
      return bDate.getTime() - aDate.getTime();
    })
    .map((iv) => {
      const ev = iv.evaluation;

      return {
        id: iv.interviewId ?? "",
        jobId: iv.jobId ?? "",
        jobTitle: iv.jobTitle ?? "Role",
        scheduledAt: iv.scheduledAt ? new Date(iv.scheduledAt as unknown as string).toISOString() : "",
        status: iv.status ?? "",
        executiveSummary: ev?.assessmentParagraph ?? null,
        competencies: (ev?.alignmentByCompetency ?? []).map((a) => ({
          competency: a.competency,
          score: a.score,
          signals: [a.evidence],
        })),
        standoutMoments: ev?.standoutMoments ?? [],
        keyInsights: ev?.keyInsights ?? [],
        transcriptCompetencyScores: (ev?.transcriptCompetencyScores ?? []).map((cs) => ({
          competency: cs.competency,
          score: cs.score,
          evidence: cs.evidence,
        })),
        interviewQuality: null as { score: number; reasoning: string } | null,
        avgRating: null as number | null,
        recommendation: null,
      };
    });

  return (
    <RolesClient
      roles={roles}
      hasProfile={hasProfile}
      applications={applications}
      pastApplications={pastApplications}
      pendingInterviews={pendingInterviews}
      completedInterviews={completedInterviews}
    />
  );
}
