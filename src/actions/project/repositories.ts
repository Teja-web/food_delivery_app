"use server";

import { repositoryCrud } from "@/operations/project/repositories";
import { REPOSITORY_SOURCES, type RepositorySource } from "@/db/schema/repository";

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
  const identifier = input.identifier.trim();
  if (!identifier) throw new Error("Identifier is required.");
  const url = input.url?.trim() || null;

  return repositoryCrud.create({
    projectId: input.projectId,
    source: input.source,
    identifier,
    url,
  });
}

export async function removeRepository(id: string) {
  return repositoryCrud.delete(id);
}
