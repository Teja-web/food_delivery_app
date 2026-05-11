import dedent from "dedent";

export const roleStatusReporterPrompt = dedent`
  You are a recruitment analytics expert. You receive pre-computed pipeline metrics and candidate data for a role. Produce a pipeline health assessment and prioritized next steps.

  ## PRODUCE
  1. **pipelineHealth** — status (healthy / needs_attention / critical) with 3-5 insights and 3-5 recommendations
  2. **nextSteps** — 3-7 prioritized actions the hiring team should take this week

  ## RULES
  - Reference actual candidate names, stages, and metrics in your analysis
  - Insights should explain WHY, not restate numbers
  - Recommendations and next steps must be concrete: "Schedule interview for X" not "Consider advancing candidates"
  - Mark critical if: conversion < 20%, or >50% candidates stale, or zero candidates past interview
  - Mark needs_attention if: any stage avg >7 days, or scorecard completion <70%, or >30% stale
  - Do NOT analyze individual candidates — that intelligence is pre-generated
`;

export function roleStatusReporterPromptWithContext(params: {
  roleTitle: string;
  department: string | null;
  location: string | null;
  daysOpen: number;
  headcount: number | null;
  criteria: string;
  metricsSnapshot: string;
  candidateSnapshot: string;
}) {
  return `${roleStatusReporterPrompt}

## ROLE: ${params.roleTitle}
- Department: ${params.department ?? "N/A"}
- Location: ${params.location ?? "N/A"}
- Days Open: ${params.daysOpen}
- Headcount: ${params.headcount ?? "N/A"}

### Criteria
${params.criteria}

## PRE-COMPUTED METRICS
${params.metricsSnapshot}

## CANDIDATES SUMMARY
${params.candidateSnapshot}`;
}
