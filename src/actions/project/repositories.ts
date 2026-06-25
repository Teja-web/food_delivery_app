"use server";

import { repositoryCrud } from "@/operations/project/repositories";
import { REPOSITORY_SOURCES, type RepositorySource } from "@/db/schema/repository";
import { getActionContext } from "@/lib/auth/context";
import {
  ensureAdapterBinding,
  normalizeRepositoryInput,
  removeAdapterBindingIfUnused,
} from "@/operations/project/source-binding-sync";

export interface AddRepositoryInput {
  projectId: string;
  source: RepositorySource;
  identifier: string;
  url?: string | null;
}

export async function addRepositoryToProject(input: AddRepositoryInput) {
  if (!REPOSITORY_SOURCES.includes(input.source)) {
    throw new Error(`Unknown source: ${input.source}`);
  }
  const ctx = await getActionContext();
  const normalized = normalizeRepositoryInput({
    source: input.source,
    identifier: input.identifier,
    url: input.url,
  });

  const row = await repositoryCrud.create({
    projectId: input.projectId,
    source: normalized.source,
    identifier: normalized.identifier,
    url: normalized.url,
  });
  await ensureAdapterBinding({
    organizationId: ctx.organizationId,
    projectId: input.projectId,
    source: normalized.source,
    externalKey: normalized.externalKey,
  });
  return row;
}

export async function removeRepository(id: string) {
  const ctx = await getActionContext();
  const row = await repositoryCrud.get(id);
  if (!row) throw new Error("Repository binding not found.");

  let externalKey: string | null = null;
  try {
    externalKey = normalizeRepositoryInput({
      source: row.source,
      identifier: row.identifier,
      url: row.url,
    }).externalKey;
  } catch {
    // If legacy malformed rows exist, still allow deletion.
  }

  await repositoryCrud.delete(id);

  if (externalKey) {
    await removeAdapterBindingIfUnused({
      organizationId: ctx.organizationId,
      projectId: row.projectId,
      source: row.source,
      externalKey,
    });
  }
}
