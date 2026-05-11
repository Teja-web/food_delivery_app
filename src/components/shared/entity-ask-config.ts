/**
 * Entity Ask AI — context types and suggestion config for Dilliznt
 */

const ENTITY_TYPES = [
  "candidate",
  "pool",
  "role",
  "application",
  "interview",
  "assessment",
  "offer",
  "insights",
] as const;

type EntityType = (typeof ENTITY_TYPES)[number];
type ViewMode = "list" | "detail";

interface EntityAskContext {
  entity: EntityType;
  id?: string;
  view: ViewMode;
}

const SUGGESTIONS: Record<string, string[]> = {
  // ---- CANDIDATE ----
  "candidate:detail": [
    "Summarize this candidate",
    "What roles match this candidate?",
    "Draft an outreach email",
    "Key strengths and gaps",
  ],
  "candidate:list": [
    "Who are the top candidates?",
    "Candidates needing follow-up",
    "Show candidates without applications",
    "Talent pool summary",
  ],

  // ---- ROLE ----
  "role:detail": [
    "Pipeline health for this role",
    "Who are the top candidates?",
    "Suggest sourcing strategy",
    "What's the hiring forecast?",
  ],
  "role:list": [
    "Which roles are at risk?",
    "Pipeline overview across all roles",
    "Roles closest to target date",
    "Suggest prioritization",
  ],

  // ---- APPLICATION ----
  "application:detail": [
    "Summarize this application",
    "Compare to other applicants",
    "What should happen next?",
    "Score breakdown and reasoning",
  ],
  "application:list": [
    "Show stalled applications",
    "Applications needing review",
    "Stage distribution summary",
    "Top-scored applications",
  ],

  // ---- INTERVIEW ----
  "interview:detail": [
    "Summarize this interview",
    "Suggest follow-up questions",
    "What's the recommendation?",
    "Compare with other interviews",
  ],
  "interview:list": [
    "Upcoming interviews this week",
    "Interviews pending feedback",
    "Show scheduling gaps",
    "Interview completion rate",
  ],

  // ---- OFFER ----
  "offer:detail": [
    "Summarize this offer",
    "Is compensation competitive?",
    "Likelihood of acceptance?",
    "Suggest negotiation points",
  ],
  "offer:list": [
    "Offers pending response",
    "Offer acceptance rate trends",
    "Expiring offers this week",
    "Recent offer activity",
  ],

  // ---- POOL ----
  "pool:detail": [
    "Summarize this talent pool",
    "Who are the top candidates?",
    "Suggest outreach campaign",
    "What roles match this pool?",
  ],
  "pool:list": [
    "Which pools need attention?",
    "Pool engagement overview",
    "Compare pool effectiveness",
    "Suggest new pool strategy",
  ],

  // ---- ASSESSMENT ----
  "assessment:detail": [
    "Summarize assessment results",
    "How do scores compare?",
    "Who performed best?",
    "Key patterns in responses",
  ],
  "assessment:list": [
    "Assessments pending review",
    "Average scores by role",
    "Which are overdue?",
    "Completion rates",
  ],

  // ---- INSIGHTS ----
  "insights:detail": [
    "What needs my attention today?",
    "Which roles are at risk?",
    "Pipeline health summary",
    "Where is hiring stuck?",
  ],
  "insights:list": [
    "What needs my attention today?",
    "Which roles are at risk?",
    "Pipeline health summary",
    "Where is hiring stuck?",
  ],
};

export function getSuggestions(entity: string, view: string): string[] {
  return SUGGESTIONS[`${entity}:${view}`] ?? SUGGESTIONS[`${entity}:list`] ?? [];
}

export const ENTITY_LABELS: Record<string, string> = {
  candidate: "Candidates",
  pool: "Talent Pools",
  role: "Roles",
  application: "Applications",
  interview: "Interviews",
  assessment: "Assessments",
  offer: "Offers",
  insights: "Insights",
};
