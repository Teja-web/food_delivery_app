import { getJiraClient } from "@/lib/integrations/clients";
import { upsertWorkItem } from "@/operations/work/work-items";
import { db } from "@/db/client";
import { repositories } from "@/db/schema/repository";
import { and, eq } from "drizzle-orm";

export interface JiraProjectPreview {
  key: string;
  exists: boolean;
  name: string | null;
  url: string | null;
  boards: Array<{ id: number; name: string; type: string; url: string }>;
}

export class JiraProjectMissingError extends Error {
  readonly code = "JIRA_PROJECT_MISSING";

  constructor(readonly projectKey: string) {
    super(`Jira project ${projectKey} does not exist.`);
  }
}

export async function previewJiraProject(
  organizationId: string,
  projectKey: string,
): Promise<JiraProjectPreview> {
  const key = normalizeJiraProjectKey(projectKey);
  const client = await getJiraClient(organizationId);
  const project = await client.getProject(key);
  if (!project) {
    const validation = await client.validateProjectKey(key);
    if (!validation.valid) {
      throw new Error(`Jira project key ${key} cannot be used: ${validation.errors.join(" ")}`);
    }
    return { key, exists: false, name: null, url: null, boards: [] };
  }

  const boards = await client.getBoardsForProject(key);
  return {
    key: project.key,
    exists: true,
    name: project.name,
    url: project.url,
    boards,
  };
}

export async function ensureJiraProjectExists(input: {
  organizationId: string;
  projectKey: string;
  projectName: string;
  createIfMissing?: boolean;
}) {
  const key = normalizeJiraProjectKey(input.projectKey);
  const client = await getJiraClient(input.organizationId);
  let project = await client.getProject(key);
  let created = false;

  if (!project) {
    if (!input.createIfMissing) {
      throw new JiraProjectMissingError(key);
    }
    const validation = await client.validateProjectKey(key);
    if (!validation.valid) {
      throw new Error(`Jira project key ${key} cannot be used: ${validation.errors.join(" ")}`);
    }
    project = await client.createProject({
      key,
      name: input.projectName,
      description: `Created by Coznt for project ${input.projectName}.`,
    });
    created = true;
  }

  return { project, created };
}

export async function resolveJiraProjectUrl(
  organizationId: string,
  projectKey: string,
): Promise<string> {
  const key = normalizeJiraProjectKey(projectKey);
  const client = await getJiraClient(organizationId);
  try {
    const boards = await client.getBoardsForProject(key);
    return boards[0]?.url ?? client.projectBrowseUrl(key);
  } catch {
    return client.projectBrowseUrl(key);
  }
}

export async function backfillJiraRepositoryUrl(input: {
  organizationId: string;
  projectId: string;
  projectKey: string;
}): Promise<string> {
  const url = await resolveJiraProjectUrl(input.organizationId, input.projectKey);
  await db
    .update(repositories)
    .set({ url, updatedAt: new Date() })
    .where(
      and(
        eq(repositories.organizationId, input.organizationId),
        eq(repositories.projectId, input.projectId),
        eq(repositories.source, "jira"),
        eq(repositories.identifier, input.projectKey),
      ),
    );
  return url;
}

export async function syncJiraProjectWorkItems(input: {
  organizationId: string;
  projectId: string;
  projectKey: string;
}): Promise<number> {
  const client = await getJiraClient(input.organizationId);
  const issues = await client.getIssues(input.projectKey);

  await Promise.all(
    issues.map((issue) =>
      upsertWorkItem({
        organizationId: input.organizationId,
        projectId: input.projectId,
        source: "jira",
        externalId: issue.key,
        externalUrl: issue.url,
        kind: jiraIssueKind(issue.type),
        title: issue.summary,
        description: issue.description ?? undefined,
        status: issue.status,
        assigneeEmail: undefined,
        raw: {
          id: issue.id,
          key: issue.key,
          type: issue.type,
          priority: issue.priority,
          labels: issue.labels,
          epicKey: issue.epicKey,
          storyPoints: issue.storyPoints,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
          resolvedAt: issue.resolvedAt,
        },
      }),
    ),
  );

  return issues.length;
}

function normalizeJiraProjectKey(projectKey: string): string {
  const key = projectKey.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
    throw new Error("Jira project key must look like ACME.");
  }
  return key;
}

function jiraIssueKind(type: string): "issue" | "story" | "task" | "bug" | "epic" {
  const normalized = type.toLowerCase();
  if (normalized.includes("epic")) return "epic";
  if (normalized.includes("story")) return "story";
  if (normalized.includes("bug")) return "bug";
  if (normalized.includes("task")) return "task";
  return "issue";
}
