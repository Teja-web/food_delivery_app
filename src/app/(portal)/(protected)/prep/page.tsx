import { redirect } from "next/navigation";
import { fetchPortalInterview, fetchPortalOpportunities } from "@/actions/portal";

export default async function PrepPage({
  searchParams,
}: {
  searchParams: Promise<{ interview?: string; role?: string }>;
}) {
  const { interview: interviewId, role: roleId } = await searchParams;

  // Role-scoped prep
  if (roleId) {
    const qs = interviewId
      ? `?role=${roleId}&interview=${interviewId}`
      : `?role=${roleId}`;
    redirect(`/prepare${qs}`);
  }

  // Interview-scoped prep — resolve the role
  if (interviewId) {
    try {
      const iv = await fetchPortalInterview(interviewId);
      if (iv?.jobId) {
        redirect(`/prepare?role=${iv.jobId}&interview=${interviewId}`);
      }
    } catch {
      // Fall through
    }
  }

  // Unattached — try to find user's first application role
  try {
    const applications = await fetchPortalOpportunities();
    if (applications && applications.length > 0) {
      const firstApp = applications[0];
      if (firstApp?.jobId) {
        redirect(`/prepare?role=${firstApp.jobId}`);
      }
    }
  } catch {
    // Fall through
  }

  // No applications — redirect to roles to select one
  redirect("/roles");
}
