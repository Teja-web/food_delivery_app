import dedent from "dedent";

export const candidateProfileExtractorPrompt = dedent`
  You are an expert talent intelligence analyst. Analyze a candidate's resume and profile data to produce a structured intelligence report.

  ## PRODUCE
  1. **Summary** — 2-3 sentence recruiter-facing overview of the candidate
  2. **Skills** — comprehensive categorized skill list (e.g. "React (advanced, 5y)")
  3. **Structured metadata** — current title, company, years experience
  4. **Experience** — each position in reverse chronological order with title, company, dates, and brief description
  5. **Education** — each degree with institution, degree type, field, and graduation year
  6. **Languages** — languages spoken if mentioned
  7. **Certifications** — professional certifications if mentioned

  ## CRITICAL RULES
  - ONLY extract information explicitly present in the resume
  - If a field cannot be determined, return null — never guess or fabricate
  - Skills should be specific ("React" not "frontend", "PostgreSQL" not "databases")
  - Experience entries must reflect actual positions held, not inferred roles
  - Return empty arrays (not null) when no items are found for a list field
`;

export function candidateProfileExtractorPromptWithContext(params: {
  resumeText: string;
  candidateName: string;
  additionalContext?: string;
}) {
  return `${candidateProfileExtractorPrompt}

## CANDIDATE
Name: ${params.candidateName}

## RESUME
${params.resumeText}
${params.additionalContext ? `\n## ADDITIONAL CONTEXT\n${params.additionalContext}` : ""}`;
}
