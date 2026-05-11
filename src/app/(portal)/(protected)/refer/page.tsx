import { fetchMyReferrals } from "@/actions/referrals";
import { getPortalCandidateContext } from "@/operations/portal";
import { ReferClient } from "./ReferClient";

export default async function ReferPage() {
  const [candidate, mine] = await Promise.all([
    getPortalCandidateContext(),
    fetchMyReferrals(),
  ]);

  // Roles the candidate has applied to or has matches for — the natural set
  // they'd want to refer. Falls back to any active applications.
  const refRoles = candidate.applications.map((a) => ({
    jobId: a.jobId,
    jobTitle: a.jobTitle ?? "Role",
    orgName: a.orgName ?? null,
  }));

  return <ReferClient refRoles={refRoles} initialReferrals={mine} />;
}
