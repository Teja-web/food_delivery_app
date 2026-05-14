"use server";

import {
  getSkillAutonomy,
  recomputeSkillAutonomy,
  recordSkillOutcome,
  LEVEL_NAMES,
  LEVEL_BLURBS,
  type RecordSkillOutcomeInput,
} from "@/operations/skill-autonomy";

export async function getSkillAutonomyAction(skillId: string, projectId: string | null) {
  return getSkillAutonomy(skillId, projectId);
}

export async function recomputeSkillAutonomyAction(skillId: string, projectId: string | null) {
  return recomputeSkillAutonomy(skillId, projectId);
}

export async function recordSkillOutcomeAction(input: RecordSkillOutcomeInput) {
  return recordSkillOutcome(input);
}

export { LEVEL_NAMES, LEVEL_BLURBS };
