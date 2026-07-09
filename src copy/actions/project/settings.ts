"use server";

import { revalidatePath } from "next/cache";

import { updateProject } from "@/actions/project/projects";

function splitCsv(s: string): string[] {
  if (s.length === 0) return [];
  return s
    .split(/[\n,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export async function saveProjectSettings(
  projectId: string,
  formData: FormData,
): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const criticalPaths = splitCsv(String(formData.get("criticalPaths") ?? "").trim());
  const productionCriticalPaths = splitCsv(
    String(formData.get("productionCriticalPaths") ?? "").trim(),
  );

  if (!name) {
    throw new Error("Project name is required.");
  }

  await updateProject(projectId, {
    name,
    description,
    criticalPaths,
    productionCriticalPaths,
  });

  revalidatePath(`/projects/${projectId}`);
}
