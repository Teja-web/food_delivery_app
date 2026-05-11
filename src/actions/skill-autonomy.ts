"use server";

import {
  getSkillAutonomy,
  recomputeSkillAutonomy,
  recordSkillOutcome,
  LEVEL_NAMES,
  LEVEL_BLURBS,
  type RecordSkillOutcomeInput,
} from "@/operations/skill-autonomy";

export async function getSkillAutonomyAction(skillId: string) {
  return getSkillAutonomy(skillId);
}

export async function recomputeSkillAutonomyAction(skillId: string) {
  return recomputeSkillAutonomy(skillId);
}

export async function recordSkillOutcomeAction(input: RecordSkillOutcomeInput) {
  return recordSkillOutcome(input);
}

export { LEVEL_NAMES, LEVEL_BLURBS };
