/**
 * candidate.intake — Index profile from resume, then score talent via dedicated scorer.
 */

import { db } from "@/db/client";
import { candidates, candidateIntelligence } from "@/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { withExecutionLog } from "@/lib/execution-log";
import { getOrgIdentityContext } from "@/lib/org-context";
import { scoreTalentCandidate } from "@/domain/scoring";
import { candidateProfileExtractorPromptWithContext } from "../agents/prompts/candidate-profile-extractor";
import { candidateProfileExtractorAgent, candidateProfileSchema } from "../agents/definitions/candidate-profile-extractor";
import { candidateTalentScorerPromptWithContext } from "../agents/prompts/candidate-talent-scorer";
import { candidateTalentScorerAgent, talentAssessmentSchema } from "../agents/definitions/candidate-talent-scorer";
import type { TalentAssessmentLLMOutput, TalentAssessment } from "../agents/definitions/candidate-talent-scorer";
import { generate } from "@/lib/ai";

/* -- Deterministic talent scoring (fixes #18) ----------------------------- */

/** LLM importance labels → fixed multipliers. Same label = same weight, every time. */
const IMPORTANCE_MULTIPLIERS: Record<string, number> = {
  primary: 4,
  significant: 3,
  moderate: 2,
  minor: 1,
};

/**
 * Convert LLM importance labels to percentage weights that sum to 100.
 * e.g. [primary, significant, moderate, moderate, minor, minor] → [31, 23, 15, 15, 8, 8]
 */
function normalizeWeights(pillars: Array<{ pillar: string; importance: string }>): Map<string, number> {
  const multipliers = pillars.map((p) => ({
    pillar: p.pillar,
    m: IMPORTANCE_MULTIPLIERS[p.importance] ?? 2,
  }));
  const totalM = multipliers.reduce((sum, p) => sum + p.m, 0);

  // First pass: proportional weights rounded down
  const weights = new Map<string, number>();
  let assigned = 0;
  for (const p of multipliers) {
    const w = Math.round((p.m / totalM) * 100);
    weights.set(p.pillar, w);
    assigned += w;
  }

  // Fix rounding remainder on the largest pillar
  if (assigned !== 100) {
    const largest = multipliers.sort((a, b) => b.m - a.m)[0].pillar;
    weights.set(largest, weights.get(largest)! + (100 - assigned));
  }

  return weights;
}

/** Compute pillar scores and weights deterministically from LLM output. */
function computeTalentAssessment(llmOutput: TalentAssessmentLLMOutput): TalentAssessment {
  const weights = normalizeWeights(llmOutput.pillars);

  const pillars = llmOutput.pillars.map((p) => {
    const avgSubsignal = p.subsignals.length > 0
      ? p.subsignals.reduce((sum, s) => sum + s.score, 0) / p.subsignals.length
      : 0;
    const score = Math.round((avgSubsignal / 4) * 100);

    return {
      pillar: p.pillar,
      weight: weights.get(p.pillar) ?? 10,
      score,
      subsignals: p.subsignals,
      signals: p.signals,
    };
  });

  return {
    roleFamily: llmOutput.roleFamily,
    pillars,
    outlook: llmOutput.outlook,
    confidence: llmOutput.confidence,
    gaps: llmOutput.gaps,
  };
}

async function upsertCandidateIntelligence(
  candidateId: string,
  organizationId: string,
  data: Partial<typeof candidateIntelligence.$inferInsert>,
) {
  const existing = await db.query.candidateIntelligence.findFirst({
    where: eq(candidateIntelligence.candidateId, candidateId),
  });

  if (existing) {
    await db
      .update(candidateIntelligence)
      .set({ ...data, evaluationCount: existing.evaluationCount + 1, lastEvaluatedAt: new Date(), updatedAt: new Date() })
      .where(eq(candidateIntelligence.id, existing.id));
    return { id: existing.id, action: "updated" as const };
  }

  const id = nanoid();
  await db.insert(candidateIntelligence).values({
    id,
    organizationId,
    candidateId,
    ...data,
  });
  return { id, action: "created" as const };
}

export async function candidateIntake(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
}) {
  const { organizationId, entityId, traceId } = params;

  return withExecutionLog(db, {
    taskId: "candidate-intake",
    organizationId,
    entityType: "candidate",
    entityId,
    traceId,
    actorId: candidateProfileExtractorAgent.slug,
  }, async (log) => {
    const candidate = await db.query.candidates.findFirst({
      where: eq(candidates.id, entityId),
    });
    if (!candidate) return { skipped: true, reason: "candidate_not_found" };
    if (!candidate.resumeText && !candidate.profile) {
      return { skipped: true, reason: "no_resume_or_profile" };
    }

    // Step 1: Extract profile intelligence
    const prompt = candidateProfileExtractorPromptWithContext({
      resumeText: candidate.resumeText ?? JSON.stringify(candidate.profile ?? {}),
      candidateName: candidate.name,
    });

    const result = await generate({ agent: candidateProfileExtractorAgent, prompt, output: candidateProfileSchema });
    const intel = (result as any).object as typeof candidateProfileSchema._output;

    // Build profile for the jsonb column
    const profileData: Record<string, unknown> = {
      summary: intel.summary,
      totalYearsExperience: intel.totalYearsExperience,
    };
    if (intel.phone) profileData.phone = intel.phone;
    if (intel.location) profileData.location = intel.location;
    if (intel.languages.length > 0) profileData.languages = intel.languages;
    if (intel.certifications.length > 0) profileData.certifications = intel.certifications;

    // Write to candidate_intelligence table
    const intelRecord = await upsertCandidateIntelligence(entityId, organizationId, {
      profile: {
        ...profileData,
        skills: intel.skills,
        currentTitle: intel.currentTitle,
        currentCompany: intel.currentCompany,
      } as any,
    });
    log.setOutput("candidate_intelligence", intelRecord.id, intelRecord.action);

    // Write structured fields back to candidate record
    const candidateUpdate: Record<string, unknown> = {
      profile: profileData,
      skills: intel.skills,
      experience: intel.experience,
      education: intel.education,
      updatedAt: new Date(),
    };
    // Update title/company/phone/location from resume extraction
    if (intel.currentTitle) candidateUpdate.title = intel.currentTitle;
    if (intel.currentCompany) candidateUpdate.company = intel.currentCompany;
    if (intel.phone) candidateUpdate.phone = intel.phone;
    if (intel.location) candidateUpdate.location = intel.location;

    await db
      .update(candidates)
      .set(candidateUpdate)
      .where(eq(candidates.id, entityId));

    // Step 2: Score talent via dedicated scorer
    const orgIdentityContext = await getOrgIdentityContext(organizationId);

    const scorerPrompt = candidateTalentScorerPromptWithContext({
      resumeText: candidate.resumeText ?? JSON.stringify(candidate.profile ?? {}),
      candidateName: candidate.name,
      extractedProfile: {
        summary: intel.summary,
        skills: intel.skills,
        currentTitle: intel.currentTitle,
        currentCompany: intel.currentCompany,
        totalYearsExperience: intel.totalYearsExperience,
        experience: intel.experience,
        education: intel.education,
      },
      orgIdentityContext,
    });

    const scorerResult = await generate({ agent: candidateTalentScorerAgent, prompt: scorerPrompt, output: talentAssessmentSchema });
    const llmAssessment = (scorerResult as any).object as TalentAssessmentLLMOutput;

    // Deterministic scoring: fixed weights per role family, pillar scores computed from subsignals
    const assessment = computeTalentAssessment(llmAssessment);

    const { score, rating } = await scoreTalentCandidate(
      db,
      entityId,
      organizationId,
      assessment,
    );

    return { success: true, profile: profileData, talentScore: score, talentRating: rating };
  });
}

// Re-export from match.ts — candidateMatchRoles is now evaluateMatchesForCandidate
// candidateMatchRoles is evaluateMatchesForCandidate from ./match
