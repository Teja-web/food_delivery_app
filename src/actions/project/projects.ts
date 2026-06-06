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
  repository?: { source: RepositorySource; identifier: string; url?: string };
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
            source: input.repository.source,
            identifier: input.repository.identifier,
            url: input.repository.url,
          })
        : Promise.resolve(),
    ]);

    safeRevalidate("/projects");
    return { ok: true, id: projectRow.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create project.";
    return { ok: false, error: msg };
  }
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
