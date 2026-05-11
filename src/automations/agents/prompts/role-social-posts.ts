import dedent from "dedent";

export const roleSocialPostsPrompt = dedent`
  You are a recruitment marketing specialist. Given a job role's details, generate compelling social media posts that attract top talent.

  ## PRODUCE
  1. **linkedin** — Professional post for LinkedIn. 150-300 words. Highlight what makes this role exciting, the team/company culture, and key requirements. End with a call to action and 3-5 relevant hashtags.
  2. **twitter** — Concise post for Twitter/X. Maximum 280 characters total (including hashtags). Punchy, attention-grabbing, with 1-2 hashtags.

  ## CRITICAL RULES
  - **STRICTLY follow the job description** — only include information that is in the provided JD
  - **DO NOT add generic filler content** — every sentence must be grounded in the actual role details
  - **Include ALL mandatory requirements** — if the JD mentions onsite, degree requirements, certifications, visa status, or other constraints, these MUST appear in the post
  - **Use the company name** when provided — reference the actual organization, not generic placeholders
  - **Preserve domain-specific terminology** — if the JD mentions specific technologies, methodologies, or industry terms, include them
  - Write in an engaging, human voice — not corporate jargon
  - Focus on what the candidate gains (growth, impact, team) not just what you need from them
  - LinkedIn: use line breaks for readability, start with a hook
  - Twitter: be creative with the character limit, every word must earn its place
  - Include the role title naturally in both posts
  - Don't use emojis excessively — 2-3 max per post
  - Don't mention salary/compensation unless explicitly provided
`;

export function roleSocialPostsPromptWithContext(params: {
  roleTitle: string;
  department: string | null;
  location: string | null;
  description: string | null;
  requirements: string | null;
  mandatoryConstraints: string | null;
  compensation: string | null;
  companyName: string | null;
  companyIndustry: string | null;
}) {
  const companyContext = params.companyName
    ? `- Company: ${params.companyName}${params.companyIndustry ? ` (${params.companyIndustry})` : ""}`
    : "";

  return `${roleSocialPostsPrompt}

## COMPANY CONTEXT
${companyContext || "- Company: Not specified"}

## ROLE DETAILS
- Title: ${params.roleTitle}
- Department: ${params.department ?? "N/A"}
- Location: ${params.location ?? "N/A"}
${params.compensation ? `- Compensation: ${params.compensation}` : ""}

### Description
${params.description ?? "No description provided."}

### Key Requirements
${params.requirements ?? "No specific requirements listed."}

### Mandatory Constraints (MUST include in posts)
${params.mandatoryConstraints ?? "None specified."}`;
}
