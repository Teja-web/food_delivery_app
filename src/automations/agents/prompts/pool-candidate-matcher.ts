import dedent from "dedent";

export const poolCandidateMatcherPrompt = dedent`
  You are a talent pool matching analyst. Your job is to evaluate whether a candidate should be automatically added to talent pools based on the pool criteria.

  ## TASK
  For each pool provided, determine if the candidate matches the pool's criteria well enough to be added automatically.

  ## MATCHING RULES
  1. **Skills Match**: Candidate should have at least 50% of the pool's required skills (or related skills)
  2. **Location Match**: If pool specifies locations, candidate should be in one of them (or "Remote" pools match anyone)
  3. **Experience Match**: If pool specifies experience range, candidate's experience should fall within it
  4. **Tags Match**: Pool tags are soft criteria - use them to gauge overall fit

  ## CONFIDENCE SCORING
  - 80-100: Strong match - candidate clearly fits the pool criteria
  - 60-79: Good match - candidate matches most criteria with minor gaps
  - 40-59: Partial match - candidate matches some criteria but has gaps
  - Below 40: Weak match - candidate doesn't fit the pool well

  ## DECISION THRESHOLD
  - shouldAdd = true if confidence >= 60
  - shouldAdd = false if confidence < 60

  ## CRITICAL RULES
  - Be conservative - only add candidates who genuinely fit
  - Consider transferable skills (e.g., "Node.js" matches "JavaScript" pools)
  - Location flexibility: "Remote" in pool criteria matches anyone
  - If pool criteria is vague, err on the side of inclusion for relevant candidates
  - Never add a candidate to a pool where they clearly don't belong
`;

export function poolCandidateMatcherPromptWithContext(params: {
  candidate: {
    name: string;
    title?: string | null;
    company?: string | null;
    location?: string | null;
    skills: string[];
    experience?: Array<{ title?: string; company?: string; description?: string | null }>;
    summary?: string | null;
  };
  pools: Array<{
    id: string;
    name: string;
    description: string;
    criteria: {
      skills: string[];
      locations: string[];
      experienceMin?: number | null;
      experienceMax?: number | null;
      tags?: string[];
    };
  }>;
}) {
  const candidateInfo = [
    `Name: ${params.candidate.name}`,
    params.candidate.title && `Title: ${params.candidate.title}`,
    params.candidate.company && `Company: ${params.candidate.company}`,
    params.candidate.location && `Location: ${params.candidate.location}`,
    params.candidate.skills.length > 0 && `Skills: ${params.candidate.skills.join(", ")}`,
    params.candidate.summary && `Summary: ${params.candidate.summary}`,
  ].filter(Boolean).join("\n");

  const poolsInfo = params.pools.map(p => {
    const criteria = [
      p.criteria.skills.length > 0 && `Skills: ${p.criteria.skills.join(", ")}`,
      p.criteria.locations.length > 0 && `Locations: ${p.criteria.locations.join(", ")}`,
      p.criteria.experienceMin != null && `Min Experience: ${p.criteria.experienceMin} years`,
      p.criteria.experienceMax != null && `Max Experience: ${p.criteria.experienceMax} years`,
      p.criteria.tags?.length && `Tags: ${p.criteria.tags.join(", ")}`,
    ].filter(Boolean).join(", ");

    return `- Pool ID: ${p.id}\n  Name: ${p.name}\n  Description: ${p.description}\n  Criteria: ${criteria || "None specified"}`;
  }).join("\n\n");

  return `${poolCandidateMatcherPrompt}

## CANDIDATE
${candidateInfo}

## POOLS TO EVALUATE
${poolsInfo}`;
}
