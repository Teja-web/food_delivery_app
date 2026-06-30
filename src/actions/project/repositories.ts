"use server";

import { repositoryCrud } from "@/operations/project/repositories";
import { REPOSITORY_SOURCES, type RepositorySource } from "@/db/schema/repository";
import { getActionContext } from "@/lib/auth/context";
import { db } from "@/db/client";
import { projects } from "@/db/schema/project";
import { and, eq } from "drizzle-orm";
import {
  ensureAdapterBinding,
  normalizeRepositoryInput,
  removeAdapterBindingIfUnused,
} from "@/operations/project/source-binding-sync";
import {
  ensureJiraProjectExists,
  JiraProjectMissingError,
  previewJiraProject,
  resolveJiraProjectUrl,
  syncJiraProjectWorkItems,
} from "@/operations/integration/jira-projects";

export interface AddRepositoryInput {
  projectId: string;
  source: RepositorySource;
  identifier: string;
  url?: string | null;
  createMissingJiraProject?: boolean;
}

export async function previewJiraProjectBinding(projectKey: string) {
  const ctx = await getActionContext();
  return previewJiraProject(ctx.organizationId, projectKey);
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
  let repositoryUrl = normalized.url;

  if (normalized.source === "jira") {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.organizationId, ctx.organizationId), eq(projects.id, input.projectId)),
      columns: { name: true },
    });
    if (!project) throw new Error("Project not found.");

    try {
      await ensureJiraProjectExists({
        organizationId: ctx.organizationId,
        projectKey: normalized.externalKey,
        projectName: project.name,
        createIfMissing: input.createMissingJiraProject === true,
      });
    } catch (err) {
      if (err instanceof JiraProjectMissingError) {
        throw new Error(
          `Jira project ${err.projectKey} does not exist. Confirm creation before binding it.`,
        );
      }
      throw err;
    }
    repositoryUrl = await resolveJiraProjectUrl(ctx.organizationId, normalized.externalKey);
  }

  const row = await repositoryCrud.create({
    projectId: input.projectId,
    source: normalized.source,
    identifier: normalized.identifier,
    url: repositoryUrl,
  });
  await ensureAdapterBinding({
    organizationId: ctx.organizationId,
    projectId: input.projectId,
    source: normalized.source,
    externalKey: normalized.externalKey,
  });
  if (normalized.source === "jira") {
    await syncJiraProjectWorkItems({
      organizationId: ctx.organizationId,
      projectId: input.projectId,
      projectKey: normalized.externalKey,
    });
  }
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
