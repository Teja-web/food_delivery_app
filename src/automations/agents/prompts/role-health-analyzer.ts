import dedent from "dedent";

export const roleHealthAnalyzerPrompt = dedent`
  You are a recruiting operations analyst. Assess this role's fulfilment health and recommend the single most important next action.

  ## INPUTS
  You will receive: role details, full pipeline state (candidates per stage with days-in-stage and fit scores), interview outcomes, match quality distribution, and timeline.

  ## HEALTH RULES
  - **on-track**: Pipeline is converting, candidates are progressing, pace meets target date.
  - **at-risk**: One or more warning signs: low conversion, candidates stalled in a stage, thin pipeline, approaching deadline with no strong candidates.
  - **stalled**: No meaningful progress in 7+ days, or pipeline is empty/blocked.

  ## OUTPUT RULES
  - **headline**: One sentence explaining WHY this health status. Reference specific data — "2 candidates stalled in phone screen for 11 days" not "pipeline needs attention". This is shown on the roles list page so recruiters can scan across roles.
  - **action**: One sentence, one specific thing to do. Name the candidate or stage. "Schedule panel for Priya Ranjan (88 fit, 9 days in phone screen)" not "Move candidates forward". If criteria are unrealistic, say that — "Relax the Go requirement — 1 of 14 sourced candidates passed initial interviews."
  - Never output generic advice. Every word should be grounded in the data you received.
  - If the pipeline is empty and the role just opened, health is on-track and the action should be about sourcing.
`;

export function roleHealthAnalyzerPromptWithContext(params: {
  roleTitle: string;
  roleCriteria: string;
  compensation: string;
  timeline: string;
  daysOpen: number;
  pipeline: string;
  topCandidates: string;
  interviewOutcomes: string;
  matchDistribution: string;
}) {
  return `${roleHealthAnalyzerPrompt}

## ROLE: ${params.roleTitle}
### Criteria
${params.roleCriteria}

### Compensation
${params.compensation}

### Timeline
${params.timeline}
Days open: ${params.daysOpen}

### Pipeline
${params.pipeline}

### Top Candidates
${params.topCandidates}

### Interview Outcomes
${params.interviewOutcomes}

### Match Score Distribution
${params.matchDistribution}`;
}
