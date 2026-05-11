import { redirect, notFound } from "next/navigation";
import {
  fetchPortalRoleDetailForOffer,
  fetchPortalProfile,
  fetchPortalPrepHistory,
  fetchPortalInterview,
  fetchPortalInterviewsForRole,
} from "@/actions/portal";
import { PrepClient } from "@/components/portal/prep-client";

export default async function PreparePage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; interview?: string }>;
}) {
  const { role: roleId, interview: interviewId } = await searchParams;

  // Must have at least a role
  if (!roleId) {
    redirect("/roles");
  }

  const [role, profile, prepHistory] = await Promise.all([
    fetchPortalRoleDetailForOffer(roleId),
    fetchPortalProfile(),
    fetchPortalPrepHistory(),
  ]);
  if (!role) notFound();

  const candidateId =
    (profile as Record<string, unknown> | null)?.primaryCandidateId as string ?? "";

  const sessions = (prepHistory ?? []).map((s) => ({
    id: s.id,
    type: s.type,
    createdAt: s.createdAt as unknown as string,
    score: s.score ?? null,
    summary: s.summary ?? null,
    feedback: s.feedback ?? [],
  }));

  // Try to get interview-specific context
  let interviewData: {
    id: string;
    scheduledAt: string;
    interviewer: string;
    interviewerRole: string;
    durationMins: number | null;
    location: string | null;
    type: string;
    focusAreas: string[];
  } | null = null;

  if (interviewId) {
    // Explicit interview requested
    try {
      const iv = await fetchPortalInterview(interviewId);
      if (iv) {
        interviewData = {
          id: iv.interviewId ?? interviewId,
          scheduledAt: iv.scheduledAt
            ? new Date(iv.scheduledAt as unknown as string).toISOString()
            : "",
          interviewer: (iv as any).interviewer ?? "",
          interviewerRole: (iv as any).interviewerRole ?? "",
          durationMins: iv.durationMins ?? null,
          location: iv.location ?? null,
          type: (iv as any).type ?? "Interview",
          focusAreas: (iv as any).focusAreas ?? [],
        };
      }
    } catch {
      // Fall through to role-only prep
    }
  } else {
    // No explicit interview — check if there's an upcoming one for this role
    try {
      const roleInterviews = await fetchPortalInterviewsForRole(roleId);
      const now = new Date();
      const twelveHoursMs = 12 * 60 * 60 * 1000;
      // Allow prep for interviews within +/- 12 hours of now
      const upcoming = (roleInterviews ?? [])
        .filter((iv) => {
          const scheduled = iv.scheduledAt
            ? new Date(iv.scheduledAt as unknown as string)
            : null;
          return (
            scheduled &&
            Math.abs(scheduled.getTime() - now.getTime()) <= twelveHoursMs &&
            (iv.status === "confirmed" || iv.status === "proposed")
          );
        })
        .sort((a, b) => {
          const aDate = new Date(a.scheduledAt as unknown as string);
          const bDate = new Date(b.scheduledAt as unknown as string);
          // Sort by closest to now
          return Math.abs(aDate.getTime() - now.getTime()) - Math.abs(bDate.getTime() - now.getTime());
        });

      if (upcoming.length > 0) {
        const iv = upcoming[0]!;
        interviewData = {
          id: iv.interviewId ?? "",
          scheduledAt: iv.scheduledAt
            ? new Date(iv.scheduledAt as unknown as string).toISOString()
            : "",
          interviewer: (iv as any).interviewer ?? "",
          interviewerRole: (iv as any).interviewerRole ?? "",
          durationMins: iv.durationMins ?? null,
          location: iv.location ?? null,
          type: (iv as any).type ?? "Interview",
          focusAreas: (iv as any).focusAreas ?? [],
        };
      }
    } catch {
      // No interviews found — role-only prep
    }
  }

  // Build the interview prop for PrepClient
  const interview = interviewData
    ? {
        id: interviewData.id,
        company: "",
        jobTitle: role.jobTitle ?? "Role",
        interviewer: interviewData.interviewer,
        interviewerRole: interviewData.interviewerRole,
        scheduledAt: interviewData.scheduledAt,
        type: interviewData.type,
        focusAreas: interviewData.focusAreas,
        durationMins: interviewData.durationMins,
        location: interviewData.location,
      }
    : {
        id: "",
        company: "",
        jobTitle: role.jobTitle ?? "Role",
        interviewer: "",
        interviewerRole: "",
        scheduledAt: "",
        type: "Role Practice",
        focusAreas: [] as string[],
        durationMins: null as number | null,
        location: null as string | null,
      };

  return (
    <PrepClient
      interview={interview}
      prepSessions={sessions}
      candidateId={candidateId}
      roleId={roleId}
      roleContext={{
        jobTitle: role.jobTitle ?? "Role",
        department: role.jobDepartment ?? null,
        location: role.jobLocation ?? null,
      }}
    />
  );
}
