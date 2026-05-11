import {
  fetchPortalPulseStats,
  fetchPortalInterviews,
  fetchPortalProfile,
  fetchPortalOpportunities,
  fetchPortalAdvisory,
  fetchPortalGrowthTimeline,
  fetchPortalNudges,
  refreshPortalNudges,
} from "@/actions/portal";
import { extractTrajectory } from "@/domain/portal/trajectory";
import { PulseClient } from "@/components/portal/pulse-client";

function deriveSkillBreakdown(
  intelligence: Record<string, unknown> | null,
  opportunities: Array<Record<string, unknown>>,
  advisoryData: Record<string, unknown> | null,
): Array<{ name: string; score: number }> {
  const explicit = (intelligence?.skillBreakdown ?? []) as Array<{ name: string; score: number }>;
  if (explicit.length > 0) return explicit;

  const insights = (advisoryData?.profileInsights ?? {}) as Record<string, unknown>;
  const topStrengths = (insights.topStrengths as string[]) ?? [];
  const growthAreas = (insights.growthAreas as string[]) ?? [];

  if (topStrengths.length > 0 || growthAreas.length > 0) {
    const skills: Array<{ name: string; score: number }> = [];
    const strengthScores = [92, 87, 83, 79, 76];
    const growthScores = [52, 44, 38, 33, 28];
    for (const [i, s] of topStrengths.entries()) skills.push({ name: s, score: strengthScores[i % strengthScores.length]! });
    for (const [i, g] of growthAreas.entries()) skills.push({ name: g, score: growthScores[i % growthScores.length]! });
    return skills.slice(0, 6);
  }

  const dimensionTotals: Record<string, { sum: number; count: number }> = {};
  for (const opp of opportunities) {
    const analysis = (opp.matchAnalysis ?? {}) as Record<string, unknown>;
    for (const dim of ["match", "readiness", "culture", "longevity"]) {
      const d = analysis[dim] as Record<string, unknown> | undefined;
      const score = d?.score as number | undefined;
      if (typeof score === "number") {
        if (!dimensionTotals[dim]) dimensionTotals[dim] = { sum: 0, count: 0 };
        dimensionTotals[dim].sum += score;
        dimensionTotals[dim].count++;
      }
    }
  }

  const DIMENSION_LABELS: Record<string, string> = {
    match: "Match Fit",
    readiness: "Readiness",
    culture: "Culture Fit",
    longevity: "Longevity",
  };

  return Object.entries(dimensionTotals).map(([key, { sum, count }]) => ({
    name: DIMENSION_LABELS[key] ?? key,
    score: Math.round(sum / count),
  }));
}

export default async function PulsePage() {
  // Refresh nudges (throttled — runs at most once per hour)
  await refreshPortalNudges().catch(() => {});

  const [stats, profile, opportunities, advisoryResult, growthTimeline, nudges] = await Promise.all([
    fetchPortalPulseStats(),
    fetchPortalProfile(),
    fetchPortalOpportunities(),
    fetchPortalAdvisory(),
    fetchPortalGrowthTimeline(),
    fetchPortalNudges(),
  ]);

  const candidate = profile?.candidate as Record<string, unknown> | null;
  const intelligence = candidate?.intelligence as Record<string, unknown> | null;
  const intelProfile = intelligence?.profile as Record<string, unknown> | null;
  const candidateProfile = candidate?.profile as Record<string, unknown> | null;
  const trajectory = extractTrajectory(intelProfile ?? candidateProfile);

  const advisoryData = (advisoryResult?.advisory ?? {}) as Record<string, unknown>;

  const skillBreakdown = deriveSkillBreakdown(
    intelProfile ?? candidateProfile,
    (opportunities ?? []) as unknown as Array<Record<string, unknown>>,
    advisoryData,
  );

  const talentAssessment = intelligence?.talentAssessment as {
    overall: number;
    rating: string;
    roleFamily: string;
    pillars: Array<{ pillar: string; score: number; weight: number; signals: string[] }>;
  } | null ?? null;

  const profileInsights = (advisoryData.profileInsights ?? null) as {
    skillNarrative: string;
    marketPosition: string;
    topStrengths: string[];
    growthAreas: string[];
  } | null;

  const serializedNudges = (nudges ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    actionUrl: n.actionUrl,
    priority: n.priority,
  }));

  return (
    <PulseClient
      stats={stats}
      trajectory={trajectory}
      skillBreakdown={skillBreakdown}
      talentAssessment={talentAssessment}
      profileInsights={profileInsights}
      growthTimeline={growthTimeline ?? []}
      nudges={serializedNudges}
    />
  );
}
