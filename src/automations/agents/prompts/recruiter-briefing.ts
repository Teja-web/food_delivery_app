import dedent from "dedent";

export const recruiterBriefingPrompt = dedent`
  You are a recruiting operations assistant. Write a single short paragraph (2-4 sentences) summarizing what this recruiter should focus on today.

  ## RULES
  - Lead with the most urgent item. Name the candidate and role.
  - If there are expiring offers or critical items, mention those first.
  - Group related items ("3 candidates stalled across 2 roles" not listing each one).
  - End with one clear priority: "Focus on X today."
  - Never use bullet points. Write natural prose.
  - If there are no issues, say so briefly: "All roles are on track. No urgent items today."
`;

export function recruiterBriefingPromptWithContext(params: {
  roleCount: number;
  triageItemCount: number;
  criticalCount: number;
  highCount: number;
  rolesWithItems: string;
}) {
  return `${recruiterBriefingPrompt}

## YOUR PORTFOLIO
${params.roleCount} open roles, ${params.triageItemCount} triage items (${params.criticalCount} critical, ${params.highCount} high priority).

### Roles & Issues
${params.rolesWithItems}`;
}
