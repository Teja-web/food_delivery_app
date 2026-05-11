/**
 * Insights page serialization — transforms aggregate query results
 * into client-safe props for the insights dashboard.
 */

// -- Types from operations -----------------------------------------------

export interface HiringVelocity {
  avgDaysToFill: number;
  target: number;
  byRole: Array<{
    roleId: string;
    role: string;
    days: number;
    target: number;
    status: string;
  }>;
}

export interface PipelineHealth {
  totalActive: number;
  conversionRate: number;
  totalHired: number;
  openRoles: number;
}

export interface SourceEffectiveness {
  source: string;
  candidates: number;
  hires: number;
  conversionRate: number;
  avgFit: number;
}

export interface RecentHire {
  id: string;
  name: string;
  role: string;
  source: string;
  daysToFill: number;
  date: string;
}

export interface Bottleneck {
  issue: string;
  impact: string;
  suggestion: string;
  urgency: "high" | "medium" | "low";
}

export interface OpenRoleOverview {
  id: string;
  title: string;
  department: string | null;
  daysOpen: number;
  stages: {
    sourced: number;
    interview: number;
    offer: number;
    hired: number;
  };
  totalCandidates: number;
}

export interface OfferAcceptance {
  acceptanceRate: number;
  sent: number;
  accepted: number;
  declined: number;
  withdrawn: number;
  pending: number;
  declineReasons: Array<{ reason: string; count: number }>;
  trend: Array<{ month: string; sent: number; accepted: number; declined: number; rate: number }>;
}

export interface InterviewOutcomes {
  totalCompleted: number;
  advanceRate: number;
  panelAgreementRate: number;
  multiPanelCount: number;
  scoresByRole: Array<{
    roleId: string;
    role: string;
    avgScore: number;
    scorecardCount: number;
  }>;
}

export interface TeamMemberActivity {
  userId: string;
  name: string;
  interviews: number;
  offers: number;
  applications: number;
  total: number;
}

// -- Page props ----------------------------------------------------------

export interface InsightsPageProps {
  hiringVelocity: HiringVelocity;
  pipelineHealth: PipelineHealth;
  sourceEffectiveness: SourceEffectiveness[];
  recentHires: RecentHire[];
  bottlenecks: Bottleneck[];
  openRoles: OpenRoleOverview[];
  offerAcceptance: OfferAcceptance;
  interviewOutcomes: InterviewOutcomes;
  teamActivity: TeamMemberActivity[];
}

// -- Serializer ----------------------------------------------------------

export function serializeInsights(
  hiringVelocity: HiringVelocity,
  pipelineHealth: PipelineHealth,
  sourceEffectiveness: SourceEffectiveness[],
  recentHires: RecentHire[],
  bottlenecks: Bottleneck[],
  openRoles: OpenRoleOverview[],
  offerAcceptance: OfferAcceptance,
  interviewOutcomes: InterviewOutcomes,
  teamActivity: TeamMemberActivity[]
): InsightsPageProps {
  return {
    hiringVelocity,
    pipelineHealth,
    sourceEffectiveness,
    recentHires,
    bottlenecks,
    openRoles,
    offerAcceptance,
    interviewOutcomes,
    teamActivity,
  };
}
