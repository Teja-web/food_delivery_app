"use server";

import { revalidatePath } from "next/cache";

import {
  ChoreographyValidationError,
  createCustomChoreography,
  listCustomChoreographies,
  softDeleteCustomChoreography,
  updateCustomChoreography,
  validateChoreographyBody,
  type CreateCustomChoreographyInput,
} from "@/operations/custom-choreographies";

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

export async function validateChoreographyBodyAction(
  body: string,
): Promise<ValidationResult> {
  const result = validateChoreographyBody(body);
  return result.ok ? { ok: true } : { ok: false, errors: result.errors };
}

export async function createCustomChoreographyAction(
  input: CreateCustomChoreographyInput,
): Promise<{ ok: true; id: string } | { ok: false; errors: string[] }> {
  try {
    const row = await createCustomChoreography(input);
    revalidatePath("/choreographies");
    return { ok: true, id: row.id };
  } catch (err) {
    if (err instanceof ChoreographyValidationError) {
      return { ok: false, errors: err.errors };
    }
    throw err;
  }
}

export async function listCustomChoreographiesAction(
  projectId: string | null,
) {
  return listCustomChoreographies(projectId);
}

export async function updateCustomChoreographyAction(
  id: string,
  input: Partial<{ name: string; body: string; version: string; enabled: boolean }>,
) {
  try {
    const row = await updateCustomChoreography(id, input);
    revalidatePath("/choreographies");
    return { ok: true as const, id: row.id };
  } catch (err) {
    if (err instanceof ChoreographyValidationError) {
      return { ok: false as const, errors: err.errors };
    }
    throw err;
  }
}

export async function softDeleteCustomChoreographyAction(id: string) {
  await softDeleteCustomChoreography(id);
  revalidatePath("/choreographies");
}
