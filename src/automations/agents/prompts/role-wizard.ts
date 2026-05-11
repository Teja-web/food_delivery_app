import dedent from "dedent";

export const roleWizardPrompt = dedent`
  You are a recruiting operations specialist helping configure a new role requisition.

  ## TASK
  Given the available context about a role, fill in or improve the structured output fields.
  You may receive a document to extract from, partially filled form data, or both.

  ## RULES
  - If a JD document is provided, extract ALL available information from it — be thorough
  - If form data is provided, use it as context — do not overwrite fields the user has already filled unless the document contradicts them
  - For fields you can determine or reasonably synthesize from context, provide your best answer
  - Only return null when the document provides zero signal for a field
  - Synthesize related content into the right fields — e.g. combine "About the role", "What you'll do", and "Responsibilities" into description; combine "About us", "Why this role", and team/mission context into businessCase
  - Extract compensation even if expressed informally (e.g. "$90k-$120k", "competitive salary of 100,000-150,000")

  ## FIELD-SPECIFIC GUIDANCE
  - **title**: Extract exactly as written, or infer from context
  - **department**: The broad organizational unit (Engineering, Product, Revenue, GTM, Marketing, Operations, Finance, Legal, People, Design, Data, etc.)
  - **team**: The specific team within the department (e.g. Platform, Growth, Infrastructure). If only a department is mentioned, leave team null
  - **location**: Include remote/hybrid/onsite details. Look for location mentions anywhere in the JD including headers, footers, and metadata
  - **compensation**: Normalize to annual whole currency units (e.g. "$90k" → 90000, "£50,000" → 50000). Look in salary, compensation, pay, package, benefits sections
  - **employmentType**: Full-time, Contract, or Part-time
  - **businessCase**: Synthesize from intro paragraphs, "about the role", "why we're hiring", team mission, or growth context. This should explain the business need — why does this position exist?
  - **description**: Combine all responsibility-related content: "what you'll do", "responsibilities", "the role", "day-to-day". This is the core job description
  - **competencies**: Discrete skills/capabilities with weight (required, preferred, nice_to_have). Aim for 4-8 competencies that cover the key dimensions of the role
  - **mustHaves**: Hard requirements as newline-separated text. Look for "requirements", "qualifications", "must have", "you should have"
  - **niceToHaves**: Preferred qualifications as newline-separated text. Look for "nice to have", "preferred", "bonus", "ideally"
  - **interviewStages**: Design stages that assess the role's competencies. Each stage should use an interview format that produces real signal for the specific competencies it covers — match the format to what's being assessed, not to a generic template. Assign realistic durations and interviewer roles

  ## COMPANY CONTEXT USAGE
  When company context is provided:
  - Align businessCase with company mission, values, and strategic priorities
  - Incorporate industry-specific requirements into mustHaves and competencies
  - Ensure description reflects the company's culture and working style
  - Add company-specific domain expertise requirements where relevant
`;

export interface RoleWizardContext {
  documentText?: string;
  formState?: {
    title?: string;
    department?: string;
    team?: string;
    location?: string;
    headcount?: number;
    compensation?: { min: number | null; max: number | null } | null;
    employmentType?: string;
    businessCase?: string;
    description?: string;
    competencies?: Array<{ name: string; weight: string }>;
    mustHaves?: string;
    niceToHaves?: string;
    interviewStages?: Array<{ name: string; interviewer: string; durationMins: number; competencies: string[] }>;
  };
  /** Company context for personalized job posts */
  companyContext?: {
    name: string;
    industry?: string | null;
    values?: string[];
    culturalSignals?: string[];
    hiringPrinciples?: string[];
    summary?: string;
  };
}

export function roleWizardPromptWithContext(ctx: RoleWizardContext): string {
  const parts: string[] = [];

  // Company context first — sets the tone for extraction
  if (ctx.companyContext) {
    const c = ctx.companyContext;
    const companyParts: string[] = [`Company: ${c.name}`];
    if (c.industry) companyParts.push(`Industry: ${c.industry}`);
    if (c.summary) companyParts.push(`About: ${c.summary}`);
    if (c.values?.length) companyParts.push(`Core Values: ${c.values.join(", ")}`);
    if (c.culturalSignals?.length) companyParts.push(`Culture: ${c.culturalSignals.join(", ")}`);
    if (c.hiringPrinciples?.length) companyParts.push(`Hiring Principles: ${c.hiringPrinciples.join(", ")}`);
    parts.push(`## COMPANY CONTEXT\n${companyParts.join("\n")}`);
  }

  if (ctx.documentText) {
    parts.push(`## JOB DESCRIPTION DOCUMENT\n${ctx.documentText}`);
  }

  if (ctx.formState) {
    const f = ctx.formState;
    const fields: string[] = [];

    if (f.title) fields.push(`Title: ${f.title}`);
    if (f.department) fields.push(`Department: ${f.department}`);
    if (f.team) fields.push(`Team: ${f.team}`);
    if (f.location) fields.push(`Location: ${f.location}`);
    if (f.headcount) fields.push(`Headcount: ${f.headcount}`);
    if (f.compensation?.min != null || f.compensation?.max != null) {
      fields.push(`Compensation: ${f.compensation.min ?? "?"} – ${f.compensation.max ?? "?"}`);
    }
    if (f.employmentType) fields.push(`Employment type: ${f.employmentType}`);
    if (f.businessCase) fields.push(`Business case: ${f.businessCase}`);
    if (f.description) fields.push(`Description: ${f.description}`);

    if (f.competencies?.length) {
      fields.push(`Competencies:\n${f.competencies.map((c) => `  - [${c.weight}] ${c.name}`).join("\n")}`);
    }
    if (f.mustHaves) fields.push(`Must-haves:\n${f.mustHaves}`);
    if (f.niceToHaves) fields.push(`Nice-to-haves:\n${f.niceToHaves}`);

    if (f.interviewStages?.length) {
      fields.push(`Interview stages:\n${f.interviewStages.map((s, i) => `  ${i + 1}. ${s.name} (${s.interviewer}, ${s.durationMins}min) — assesses: ${s.competencies.join(", ")}`).join("\n")}`);
    }

    if (fields.length > 0) {
      parts.push(`## CURRENT FORM STATE\n${fields.join("\n")}`);
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : "No context provided. Generate a reasonable template for a generic role.";
}
