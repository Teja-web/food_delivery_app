import { db } from "@/db/client";
import { candidateIntelligence } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Generate/refresh candidate advisory by running candidateIntake.
 * This extracts profile and generates talent assessment with gaps.
 */
export async function generateCandidateAdvisory(params: {
  organizationId: string;
  candidateId: string;
}) {
  const { candidateIntake } = await import("@/automations/tasks/candidate");
  return candidateIntake({
    organizationId: params.organizationId,
    entityId: params.candidateId,
  });
}

/**
 * Read the latest portal advisory from candidateIntelligence.
 * Returns talentAssessment which includes gaps, pillars, and outlook.
 */
export async function getLatestAdvisory(candidateId: string) {
  const intel = await db.query.candidateIntelligence.findFirst({
    where: eq(candidateIntelligence.candidateId, candidateId),
  });

  if (!intel) return null;

  return {
    advisory: intel.talentAssessment,
    profile: intel.profile,
    createdAt: intel.lastEvaluatedAt ?? intel.createdAt,
    evaluationCount: intel.evaluationCount,
  };
}
