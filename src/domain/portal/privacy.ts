const BLOCKED_KEYS = new Set([
  "talentScore",
  "grade",
  "letterGrade",
  "predictions",
  "riskFlags",
  "recruiterNotes",
  "recommendations",
  "scoringGuidance",
  "redFlags",
  "sensitive",
]);

export function stripSensitiveIntelligence<T = unknown>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripSensitiveIntelligence(item)) as T;
  }

  if (!value || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const filtered: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(source)) {
    if (BLOCKED_KEYS.has(key)) continue;
    filtered[key] = stripSensitiveIntelligence(nested);
  }
  return filtered as T;
}

export function toCandidateOpportunity(match: {
  score?: number | null;
  stage?: string | null;
  status?: string | null;
  matchAnalysis?: unknown;
  jobTitle?: string | null;
  jobLocation?: string | null;
  jobDescription?: string | null;
  applicationId?: string;
  jobId?: string;
  organizationId?: string;
}) {
  const safe = stripSensitiveIntelligence(match.matchAnalysis ?? {}) as Record<string, unknown>;
  const analysis = (safe.analysis ?? {}) as Record<string, unknown>;

  return {
    id: match.applicationId,
    jobId: match.jobId,
    organizationId: match.organizationId,
    title: match.jobTitle ?? "Role",
    location: match.jobLocation ?? "Remote",
    description: match.jobDescription ?? "",
    stage: match.stage ?? "applied",
    status: match.status ?? "active",
    fitIndicator: match.score ?? null,
    whyYouFit: (analysis.summary as string) ?? "Strong profile alignment based on your skills and experience.",
    strengths: (analysis.strengths as string[]) ?? [],
    gaps: (analysis.gaps as string[]) ?? [],
    candidateVerdict: (analysis.candidateVerdict as { verdict: string; reason: string }) ?? null,
    cultureFit: (analysis.portalCultureFit as Array<{ label: string; match: string }>) ?? [],
    suggestedQuestions: (analysis.suggestedQuestions as string[]) ?? [],
    recommendation: (analysis.recommendation as string) ?? "",
    match: safe,
  };
}
