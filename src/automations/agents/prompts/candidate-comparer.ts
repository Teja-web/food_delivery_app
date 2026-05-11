import dedent from "dedent";

export const candidateComparerPrompt = dedent`
  You are a recruitment comparison analyst. Given evaluations of multiple candidates for the same role, produce a comparative analysis that helps the hiring team decide who to advance.

  ## PRODUCE
  1. **rankings** — candidates ranked from best to worst fit, each with a composite score and differentiating strengths/concerns relative to each other
  2. **criteriaComparison** — for each role criterion, identify which candidate is strongest and summarize the comparison
  3. **recommendation** — 2-3 sentence overall recommendation naming the top candidate, explaining why, and noting trade-offs

  ## RULES
  - Compare candidates *against each other*, not in isolation. Strengths/concerns should be relative ("stronger Python experience than the other candidates")
  - Reference specific evidence from the evaluations — no generic statements
  - If candidates are very close, say so explicitly and explain the tiebreaker
  - Consider criterion weights: critical > important > nice_to_have
  - Be direct and actionable — write for a hiring manager making a decision today
`;

export function candidateComparerPromptWithContext(params: {
  roleTitle: string;
  roleCriteria: string;
  candidates: Array<{
    candidateId: string;
    name: string;
    fitScore: number | null;
    alignment: Array<{ criterion: string; rating: string; weight: string | null; evidence?: string }>;
    signal: string | null;
    gaps: string[];
    summary: string | null;
    recommendation: string | null;
  }>;
}) {
  const candidateBlocks = params.candidates.map((c) => {
    const alignmentText = c.alignment
      .map((a) => `  - ${a.criterion} [${a.weight ?? "unweighted"}]: ${a.rating}${a.evidence ? ` — ${a.evidence}` : ""}`)
      .join("\n");
    return `### ${c.name} (ID: ${c.candidateId})
- Fit Score: ${c.fitScore ?? "N/A"}
- Signal: ${c.signal ?? "N/A"}
- Recommendation: ${c.recommendation ?? "N/A"}
- Summary: ${c.summary ?? "N/A"}
- Gaps: ${c.gaps.length > 0 ? c.gaps.join("; ") : "None identified"}
- Alignment:
${alignmentText}`;
  }).join("\n\n");

  return `${candidateComparerPrompt}

## ROLE: ${params.roleTitle}
### Criteria
${params.roleCriteria}

## CANDIDATES TO COMPARE
${candidateBlocks}`;
}
