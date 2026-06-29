"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { environments, type EnvironmentTier } from "@/db/schema/environment";
import { governancePolicies } from "@/db/schema/governance/policies";
import { projects } from "@/db/schema/project";
import { repositories, type RepositorySource } from "@/db/schema/repository";
import { assertElevatedRole, getActionContext } from "@/lib/auth/context";
import { getPolicyTemplate } from "@/lib/governance/policy-templates";
import { projectCrud } from "@/operations/project/projects";
import { safeRevalidate } from "@/lib/safe-revalidate";
import {
  ensureAdapterBinding,
  normalizeRepositoryInput,
} from "@/operations/project/source-binding-sync";
import { createGitHubRepository } from "@/operations/integration/github-oauth";
import {
  ensureJiraProjectExists,
  JiraProjectMissingError,
  previewJiraProject,
  resolveJiraProjectUrl,
  syncJiraProjectWorkItems,
} from "@/operations/integration/jira-projects";

export async function listProjects(opts: { offset?: number; limit?: number } = {}) {
  return projectCrud.list({ offset: opts.offset ?? 0, limit: opts.limit ?? 25, sortBy: "createdAt", sortOrder: "desc" });
}

export async function searchProjects(query: string, opts: { offset?: number; limit?: number } = {}) {
  return projectCrud.search(query, { offset: opts.offset ?? 0, limit: opts.limit ?? 25 });
}

export async function getProject(id: string) {
  return projectCrud.get(id);
}

export async function createProject(input: Parameters<typeof projectCrud.create>[0]) {
  return projectCrud.create(input);
}

const SLUG_PATTERN = /^[a-z0-9-]+$/;

export async function checkProjectSlugAvailability(
  slug: string,
): Promise<{ available: boolean; reason?: "empty" | "invalid" }> {
  const trimmed = slug.trim();
  if (!trimmed) return { available: false, reason: "empty" };
  if (!SLUG_PATTERN.test(trimmed)) return { available: false, reason: "invalid" };
  const ctx = await getActionContext();
  const existing = await db.query.projects.findFirst({
    where: and(eq(projects.organizationId, ctx.organizationId), eq(projects.slug, trimmed)),
    columns: { id: true },
  });
  return { available: !existing };
}

export type CreateProjectResult =
  | { ok: true; id: string }
  | { ok: false; error: string; field?: "name" | "slug" };

export interface CreateProjectWizardInput {
  /** Step 1 — basics. */
  name: string;
  slug: string;
  description?: string;
  /** Step 2 — governance. Empty array + skipGovernance=true means ungated mode. */
  approverIds: string[];
  templateId: string;
  skipGovernance?: boolean;
  /** Step 3 — sources & environments. All optional. */
  repository?:
    | {
        source: "github";
        identifier?: string;
        url?: string;
        githubRepositoryId?: number;
        owner?: string;
        repoName?: string;
        cloneUrl?: string;
        createNewRepositoryName?: string;
      }
    | {
        source: Exclude<RepositorySource, "github">;
        identifier: string;
        url?: string;
        createMissingJiraProject?: boolean;
      };
  environmentsToCreate?: Array<{ name: string; tier: EnvironmentTier }>;
  criticalPaths?: string[];
  productionCriticalPaths?: string[];
}

export async function createProjectAction(
  input: CreateProjectWizardInput,
): Promise<CreateProjectResult> {
  const name = input.name.trim();
  const slug = input.slug.trim();
  if (!name) return { ok: false, error: "Name is required.", field: "name" };
  if (!slug) return { ok: false, error: "Slug is required.", field: "slug" };
  if (!SLUG_PATTERN.test(slug)) {
    return { ok: false, error: "Slug must be lowercase letters, digits, and hyphens.", field: "slug" };
  }
  if (!input.skipGovernance && input.approverIds.length === 0) {
    return {
      ok: false,
      error: "Pick at least one approver, or explicitly skip governance setup.",
    };
  }

  const ctx = await getActionContext();
  const dup = await db.query.projects.findFirst({
    where: and(eq(projects.organizationId, ctx.organizationId), eq(projects.slug, slug)),
    columns: { id: true },
  });
  if (dup) return { ok: false, error: "That slug is already in use.", field: "slug" };

  const template = input.skipGovernance ? null : getPolicyTemplate(input.templateId);
  if (!input.skipGovernance && !template) {
    return { ok: false, error: `Unknown governance template: ${input.templateId}.` };
  }
  let normalizedRepo:
    | ReturnType<typeof normalizeRepositoryInput>
    | null = null;
  let repositoryUrl: string | null = null;
  if (input.repository) {
    try {
      let repositoryInput = input.repository;
      if (repositoryInput.source === "github") {
        const createdRepoName = repositoryInput.createNewRepositoryName?.trim() || "";
        if (createdRepoName) {
          const created = await createGitHubRepository({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            name: createdRepoName,
            isPrivate: true,
          });
          repositoryInput = {
            source: "github",
            identifier: `${created.owner}/${created.repoName}`,
            url: created.cloneUrl,
            owner: created.owner,
            repoName: created.repoName,
            cloneUrl: created.cloneUrl,
            githubRepositoryId: created.id,
          };
        } else if (repositoryInput.owner && repositoryInput.repoName) {
          repositoryInput = {
            source: "github",
            identifier: `${repositoryInput.owner}/${repositoryInput.repoName}`,
            url: repositoryInput.cloneUrl ?? repositoryInput.url,
            owner: repositoryInput.owner,
            repoName: repositoryInput.repoName,
            cloneUrl: repositoryInput.cloneUrl ?? repositoryInput.url,
            githubRepositoryId: repositoryInput.githubRepositoryId,
          };
        }
      }

      if (!("identifier" in repositoryInput) || !repositoryInput.identifier?.trim()) {
        return {
          ok: false,
          error:
            repositoryInput.source === "github"
              ? "Select a GitHub repository or enter a new repository name."
              : "Repository identifier is required.",
        };
      }

      normalizedRepo = normalizeRepositoryInput({
        source: repositoryInput.source,
        identifier: repositoryInput.identifier,
        url: repositoryInput.url,
      });
      repositoryUrl = normalizedRepo.url;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Invalid repository binding." };
    }
  }

  if (normalizedRepo?.source === "jira") {
    try {
      await ensureJiraProjectExists({
        organizationId: ctx.organizationId,
        projectKey: normalizedRepo.externalKey,
        projectName: name,
        createIfMissing:
          input.repository?.source === "jira" &&
          input.repository.createMissingJiraProject === true,
      });
    } catch (err) {
      if (err instanceof JiraProjectMissingError) {
        return {
          ok: false,
          error: `Jira project ${err.projectKey} does not exist. Confirm creation before creating this Coznt project.`,
        };
      }
      return { ok: false, error: err instanceof Error ? err.message : "Jira project check failed." };
    }
    repositoryUrl = await resolveJiraProjectUrl(ctx.organizationId, normalizedRepo.externalKey);
  }

  try {
    const projectRow = await projectCrud.create({
      name,
      slug,
      description: input.description?.trim() || undefined,
      defaultApproverIds: input.skipGovernance ? [] : input.approverIds,
      criticalPaths: input.criticalPaths ?? [],
      productionCriticalPaths: input.productionCriticalPaths ?? [],
    });

    // Seed everything in parallel — failures here don't bubble up as
    // hard project-create errors, but they are logged. The wizard's
    // happy-path expectation is that all of these succeed, since the
    // input shape is already validated by the form.
    await Promise.all([
      template && template.policies.length > 0
        ? db.insert(governancePolicies).values(
            template.policies.map((p) => ({
              organizationId: ctx.organizationId,
              kind: p.kind,
              scopeType: p.scopeType,
              scopeId: projectRow.id,
              appliesToPlanKind: p.appliesToPlanKind ?? undefined,
              transitionFrom: p.transitionFrom ?? undefined,
              transitionTo: p.transitionTo ?? undefined,
              name: p.name,
              description: p.description,
              details: p.details,
              enabled: true,
            })),
          )
        : Promise.resolve(),
      input.environmentsToCreate && input.environmentsToCreate.length > 0
        ? db.insert(environments).values(
            input.environmentsToCreate.map((e) => ({
              organizationId: ctx.organizationId,
              projectId: projectRow.id,
              name: e.name,
              tier: e.tier,
            })),
          )
        : Promise.resolve(),
      input.repository
        ? db.insert(repositories).values({
            organizationId: ctx.organizationId,
            projectId: projectRow.id,
            source: normalizedRepo!.source,
            identifier: normalizedRepo!.identifier,
            url: repositoryUrl,
          })
        : Promise.resolve(),
    ]);

    if (normalizedRepo) {
      await ensureAdapterBinding({
        organizationId: ctx.organizationId,
        projectId: projectRow.id,
        source: normalizedRepo.source,
        externalKey: normalizedRepo.externalKey,
      });
      if (normalizedRepo.source === "jira") {
        await syncJiraProjectWorkItems({
          organizationId: ctx.organizationId,
          projectId: projectRow.id,
          projectKey: normalizedRepo.externalKey,
        });
      }
    }

    safeRevalidate("/projects");
    return { ok: true, id: projectRow.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create project.";
    return { ok: false, error: msg };
  }
}

export async function previewJiraProjectConnectionAction(projectKey: string) {
  const ctx = await getActionContext();
  return previewJiraProject(ctx.organizationId, projectKey);
}

export async function updateProject(id: string, input: Parameters<typeof projectCrud.update>[1]) {
  return projectCrud.update(id, input);
}

export async function deleteProject(id: string) {
  return projectCrud.delete(id);
}

/**
 * Toggle the per-project "require human approval for merge" gate-policy
 * flag. Governance-sensitive — only admin/owner roles can flip it so a
 * leaked member key can't open or close the dispatch gate.
 */
export async function setRequireHumanApprovalForMerge(
  projectId: string,
  value: boolean,
): Promise<{ projectId: string; requireHumanApprovalForMerge: boolean }> {
  const ctx = await getActionContext();
  assertElevatedRole(ctx, "Changing the merge-approval policy");

  await db
    .update(projects)
    .set({ requireHumanApprovalForMerge: value, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, ctx.organizationId)));

  safeRevalidate(`/projects/${projectId}`);
  return { projectId, requireHumanApprovalForMerge: value };
}
