import { eq } from "drizzle-orm";
import { candidates, candidateIntelligence } from "@/db/schema";
import { nanoid } from "nanoid";
import type { TalentAssessment } from "@/automations/agents/definitions/candidate-talent-scorer";

/**
 * Compute a weighted overall score from deterministic pillar weights and scores.
 * Weights must sum to 100. Returns a score 0-100.
 */
function computeTalentScore(
  pillars: Array<{ weight: number; score: number }>,
): number {
  const score = pillars.reduce((sum, p) => sum + p.score * p.weight / 100, 0);
  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Derive a letter rating from a 0-100 talent score.
 */
function computeTalentRating(score: number): string {
  if (score >= 90) return "AAA";
  if (score >= 85) return "AA";
  if (score >= 80) return "A";
  if (score >= 75) return "BBB";
  if (score >= 70) return "BB";
  if (score >= 60) return "B";
  if (score >= 50) return "CCC";
  if (score >= 40) return "CC";
  if (score >= 30) return "C";
  return "D";
}

/**
 * Persist a talent assessment to candidate_intelligence and update the candidate headline.
 */
export async function scoreTalentCandidate(
  db: any,
  candidateId: string,
  organizationId: string,
  assessment: TalentAssessment,
) {
  const score = computeTalentScore(assessment.pillars);
  const rating = computeTalentRating(score);

  const talentAssessment = {
    roleFamily: assessment.roleFamily,
    pillars: assessment.pillars,
    overall: score,
    rating,
    outlook: assessment.outlook,
    confidence: assessment.confidence,
    gaps: assessment.gaps,
  };

  // Upsert talent assessment into candidate_intelligence
  const existing = await db.query.candidateIntelligence.findFirst({
    where: eq(candidateIntelligence.candidateId, candidateId),
  });

  if (existing) {
    await db
      .update(candidateIntelligence)
      .set({ talentAssessment, lastEvaluatedAt: new Date(), updatedAt: new Date() })
      .where(eq(candidateIntelligence.id, existing.id));
  } else {
    await db.insert(candidateIntelligence).values({
      id: nanoid(),
      organizationId,
      candidateId,
      talentAssessment,
    });
  }

  // Stamp headline score on candidate row
  await db
    .update(candidates)
    .set({ talentScore: score, updatedAt: new Date() })
    .where(eq(candidates.id, candidateId));

  return { score, rating };
}
