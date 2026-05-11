"use server";

import { skillCrud, listSkillsForProject } from "@/operations/skills";

export async function listSkills(opts: { offset?: number; limit?: number } = {}) {
  return skillCrud.list({ offset: opts.offset ?? 0, limit: opts.limit ?? 25, sortBy: "createdAt", sortOrder: "desc" });
}

export async function getSkill(id: string) {
  return skillCrud.get(id);
}

export async function createSkill(input: Parameters<typeof skillCrud.create>[0]) {
  return skillCrud.create(input);
}

export async function updateSkill(id: string, input: Parameters<typeof skillCrud.update>[1]) {
  return skillCrud.update(id, input);
}

export async function deleteSkill(id: string) {
  return skillCrud.delete(id);
}

export { listSkillsForProject };
