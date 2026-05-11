import { getPortalOpportunity, getPortalProfile, listOpenRoles, listPortalOpportunities } from "@/operations/portal";
import { stripSensitiveIntelligence, toCandidateOpportunity } from "./privacy";

async function listCandidateOpportunities(email: string) {
  const rows = await listPortalOpportunities(email);
  return rows.map((row) => toCandidateOpportunity(row));
}

async function getCandidateOpportunity(email: string, applicationId: string) {
  const row = await getPortalOpportunity(email, applicationId);
  if (!row) return null;

  return {
    ...toCandidateOpportunity(row),
    details: {
      whatToHighlight: (((row.matchAnalysis as Record<string, unknown> | null)?.analysis as Record<string, unknown> | undefined)?.strengths as string[] | undefined) ?? [],
      areasToAddress: (((row.matchAnalysis as Record<string, unknown> | null)?.analysis as Record<string, unknown> | undefined)?.gaps as string[] | undefined) ?? [],
    },
  };
}

export async function getRecommendedRoles(email: string, limit = 10) {
  const [profile, roles] = await Promise.all([
    getPortalProfile(email),
    listOpenRoles(),
  ]);

  if (!profile || roles.length === 0) return [];

  const candidateProfile = stripSensitiveIntelligence(
    (profile.candidate.profile ?? {}) as Record<string, unknown>
  );
  const candidateSkills = ((candidateProfile.skills as string[]) ?? []).map((s) => s.toLowerCase());
  const candidateTitle = ((candidateProfile.currentTitle as string) ?? "").toLowerCase();
  const preferences = {} as Record<string, unknown>;

  // Build a lookup of existing AI match analyses (jobId → analysis)
  const matchAnalyses = (candidateProfile.matchAnalyses ?? []) as Array<Record<string, unknown>>;
  const analysisMap = new Map<string, Record<string, unknown>>();
  for (const ma of matchAnalyses) {
    const jobId = ma.jobId as string;
    if (jobId) analysisMap.set(jobId, ma);
  }

  const scored = roles.map((role) => {
    // Prefer existing AI match analysis when available
    const existingAnalysis = analysisMap.get(role.id);
    if (existingAnalysis) {
      const matchScore = (existingAnalysis.match as Record<string, unknown>)?.score as number
        ?? existingAnalysis.score as number
        ?? 0;
      const strengths = (existingAnalysis.strengths as string[]) ?? [];
      const fitReason = strengths.length > 0
        ? `Matches your experience in ${strengths.slice(0, 3).join(", ")}`
        : (existingAnalysis.summary as string) ?? null;

      return { role, score: matchScore, fitReason, fromAI: true };
    }

    // Fallback: keyword heuristic for roles without AI analysis
    const jobCriteria = (role.criteria ?? {}) as Record<string, unknown>;
    const keywords = (jobCriteria.keywords as Array<{ term: string; category: string; importance: string }>) ?? [];
    const criteria = (jobCriteria.criteria as Array<{ name: string; description: string; weight: string }>) ?? [];

    let score = 0;
    const matchReasons: string[] = [];

    const importanceWeight = { critical: 20, important: 12, nice_to_have: 5 };
    for (const kw of keywords) {
      const term = kw.term.toLowerCase();
      if (candidateSkills.some((s) => s.includes(term) || term.includes(s))) {
        const w = importanceWeight[kw.importance as keyof typeof importanceWeight] ?? 5;
        score += w;
        if (kw.importance === "critical") matchReasons.push(kw.term);
      }
    }

    for (const c of criteria) {
      const criteriaText = `${c.name} ${c.description}`.toLowerCase();
      const matched = candidateSkills.filter((s) => criteriaText.includes(s));
      if (matched.length > 0) {
        const w = c.weight === "critical" ? 15 : c.weight === "important" ? 8 : 3;
        score += w;
        if (c.weight === "critical" && !matchReasons.includes(c.name)) {
          matchReasons.push(c.name);
        }
      }
    }

    if (candidateTitle) {
      const titleWords = candidateTitle.split(/\s+/).filter((w) => w.length > 2);
      const roleTitle = (role.title ?? "").toLowerCase();
      const titleMatches = titleWords.filter((w) => roleTitle.includes(w));
      if (titleMatches.length > 0) {
        score += 15 * (titleMatches.length / titleWords.length);
        matchReasons.push("Role aligns with your current title");
      }
    }

    const remotePref = (preferences.remotePreference as string) ?? "";
    const roleLocation = (role.location ?? "").toLowerCase();
    if (remotePref && roleLocation.includes(remotePref.toLowerCase())) score += 8;

    const fitReason = matchReasons.length > 0
      ? `Matches your experience in ${matchReasons.slice(0, 3).join(", ")}`
      : null;

    return { role, score, fitReason, fromAI: false };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => ({
      id: s.role.id,
      organizationId: s.role.organizationId,
      title: s.role.title,
      department: s.role.department,
      description: s.role.description,
      location: s.role.location,
      employmentType: s.role.employmentType,
      comp: s.role.comp,
      fit: Math.min(100, Math.round(s.score)),
      fitReason: s.fitReason,
    }));
}
