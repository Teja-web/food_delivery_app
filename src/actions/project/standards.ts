"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";

import { ARTIFACT_FILE_TYPES, REQUIRED_ORGANIZATION_ARTIFACT_KEYS } from "@/db/schema/artifact";
import { deleteProjectArtifact, upsertProjectArtifact } from "@/operations/artifacts";

const projectStandardPayloadSchema = z.object({
  id: z.string().uuid().optional(),
  projectId: z.string().min(1),
  title: z.string().min(1, "Title is required."),
  body: z.string().refine((value) => value.trim().length > 0, "File content is required."),
  type: z.enum(ARTIFACT_FILE_TYPES),
  sourceFileName: z.string().min(1, "File name is required."),
  category: z.string().optional().nullable(),
  requiredKey: z.enum(REQUIRED_ORGANIZATION_ARTIFACT_KEYS).optional().nullable(),
});

export type SaveProjectStandardResult =
  | { ok: true }
  | { ok: false; error: string };

export async function saveProjectStandardAction(
  input: z.input<typeof projectStandardPayloadSchema>,
): Promise<SaveProjectStandardResult> {
  const parsed = projectStandardPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid standard." };
  }

  try {
    await upsertProjectArtifact({
      id: parsed.data.id,
      projectId: parsed.data.projectId,
      title: parsed.data.title.trim(),
      name: parsed.data.sourceFileName.trim(),
      body: parsed.data.body,
      type: parsed.data.type,
      category: parsed.data.category ?? null,
      requiredKey: parsed.data.requiredKey ?? null,
      createdVia: "upload",
    });
    revalidatePath(`/projects/${parsed.data.projectId}/standards`);
    revalidatePath(`/projects/${parsed.data.projectId}/overview`);
    revalidatePath(`/projects/${parsed.data.projectId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not save project standard.",
    };
  }
}

export async function deleteProjectStandardAction(
  projectId: string,
  artifactId: string,
): Promise<SaveProjectStandardResult> {
  try {
    await deleteProjectArtifact(artifactId);
    revalidatePath(`/projects/${projectId}/standards`);
    revalidatePath(`/projects/${projectId}/overview`);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not delete project standard.",
    };
  }
}

