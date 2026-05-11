import dedent from "dedent";

export const performanceReporterPrompt = dedent`
  You are a recruitment performance analyst. You will receive pre-computed metrics across multiple roles. Your job is to provide QUALITATIVE analysis only — all numbers are already calculated.

  ## PRODUCE
  1. **overallHealth** — assess overall health across all roles (healthy / needs_attention / critical)
  2. **roleAssessments** — per-role health, top candidate name, and biggest bottleneck
  3. **crossRoleInsights** — 3-5 insights spanning multiple roles: patterns, comparisons, systemic issues, resource conflicts
  4. **bottomlineAssessment** — 2-3 sentence executive summary
  5. **prioritizedActions** — top 5-10 actions sorted by impact, tagged with role name

  ## RULES
  - Reference actual role titles, candidate names, and data points
  - Cross-role insights should find PATTERNS the individual role data can't show
  - Mark critical if any role has zero pipeline movement or >50% stale candidates
  - Mark needs_attention if conversion is below org average or scheduling is slow
  - Actions should be concrete and specific, not generic advice
  - Do NOT invent numbers — metrics are shown to the user separately
`;

export function performanceReporterPromptWithContext(params: {
  reportType: "recruiter" | "hiring_manager" | "department";
  subjectName: string;
  metricsSnapshot: string;
  roles: Array<{
    roleId: string;
    roleTitle: string;
    department: string | null;
    status: string;
    daysOpen: number;
    totalCandidates: number;
    conversionRate: string;
    candidates: Array<{
      name: string;
      stage: string;
      source: string;
      fitScore: number | null;
      daysInPipeline: number;
      daysSinceLastActivity: number;
    }>;
  }>;
}) {
  const typeLabel = params.reportType === "recruiter" ? "Recruiter"
    : params.reportType === "hiring_manager" ? "Hiring Manager"
    : "Department";

  const roleBlocks = params.roles.map((r) => {
    const candidateLines = r.candidates
      .slice(0, 15) // cap to avoid massive prompts
      .map((c) => `  - ${c.name} | ${c.stage} | Source: ${c.source} | Fit: ${c.fitScore ?? "N/A"} | ${c.daysInPipeline}d in pipeline | ${c.daysSinceLastActivity}d since activity`)
      .join("\n");

    return `### ${r.roleTitle} (${r.roleId})
- Department: ${r.department ?? "N/A"} | Status: ${r.status} | ${r.daysOpen}d open | ${r.totalCandidates} candidates | ${r.conversionRate} conversion
${candidateLines || "  No candidates"}`;
  }).join("\n\n");

  return `${performanceReporterPrompt}

## REPORT: ${typeLabel} — ${params.subjectName}

## PRE-COMPUTED METRICS
${params.metricsSnapshot}

## ROLES (${params.roles.length})
${roleBlocks || "No roles found."}

## INSTRUCTIONS
- Return roleAssessments for ALL roles listed above (use their roleId)
- Focus cross-role insights on patterns across the full portfolio`;
}
