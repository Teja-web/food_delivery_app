import {
  fetchHiringVelocity,
  fetchPipelineHealth,
  fetchSourceEffectiveness,
  fetchRecentHires,
  fetchBottlenecks,
  fetchOpenRolesOverview,
  fetchOfferAcceptance,
  fetchInterviewOutcomes,
  fetchTeamActivity,
} from "@/actions/insights";
import { serializeInsights } from "./serialize";
import InsightsClient from "./InsightsClient";

export default async function InsightsPage() {
  const [hiringVelocity, pipelineHealth, sourceEffectiveness, recentHires, bottlenecks, openRoles, offerAcceptance, interviewOutcomes, teamActivity] =
    await Promise.all([
      fetchHiringVelocity(),
      fetchPipelineHealth(),
      fetchSourceEffectiveness(),
      fetchRecentHires(),
      fetchBottlenecks(),
      fetchOpenRolesOverview(),
      fetchOfferAcceptance(),
      fetchInterviewOutcomes(),
      fetchTeamActivity(),
    ]);

  const props = serializeInsights(
    hiringVelocity,
    pipelineHealth,
    sourceEffectiveness,
    recentHires,
    bottlenecks,
    openRoles,
    offerAcceptance,
    interviewOutcomes,
    teamActivity
  );

  return <InsightsClient {...props} />;
}
