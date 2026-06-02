"use server";

import { revalidatePath } from "next/cache";

import {
  createProjectLearning,
  listProjectLearnings,
  setProjectLearningPin,
  softDeleteProjectLearning,
  type CreateProjectLearningInput,
} from "@/operations/plan/project-learnings";

export async function listProjectLearningsAction(projectId: string) {
  return listProjectLearnings(projectId);
}

export async function createProjectLearningAction(input: CreateProjectLearningInput) {
  const row = await createProjectLearning(input);
  revalidatePath(`/projects/${input.projectId}`);
  return row;
}

export async function softDeleteProjectLearningAction(id: string, projectId: string) {
  await softDeleteProjectLearning(id);
  revalidatePath(`/projects/${projectId}`);
}

export async function setProjectLearningPinAction(
  id: string,
  projectId: string,
  pinOrder: number | null,
) {
  await setProjectLearningPin(id, pinOrder);
  revalidatePath(`/projects/${projectId}`);
}
