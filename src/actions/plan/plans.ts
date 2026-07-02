"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { repositories } from "@/db/schema/repository";
import { getActionContext } from "@/lib/auth/context";
import { stringifyFrontmatter } from "@/lib/authoring/parse-frontmatter";
import {
  createBranchRef,
  createPullRequest,
  findInstallationForRepo,
  getBranchSha,
  putFileContent,
} from "@/lib/integrations/github-app";
import { GitHubClient } from "@/lib/integrations/clients/github";
import { getGitHubAccessToken } from "@/operations/integration/github-oauth";
import {
  appendPlanRevision,
  createPlan as createPlanOp,
  listPlanRevisions,
  listPlansByProject,
  planCrud,
} from "@/operations/plan/plans";

export async function listPlans(opts: { offset?: number; limit?: number } = {}) {
  return planCrud.list({
    offset: opts.offset ?? 0,
    limit: opts.limit ?? 25,
    sortBy: "updatedAt",
    sortOrder: "desc",
  });
}

export async function getPlan(id: string) {
  return planCrud.get(id);
}

export async function createPlan(input: Parameters<typeof createPlanOp>[0]) {
  return createPlanOp(input);
}

export async function updatePlan(id: string, input: Parameters<typeof planCrud.update>[1]) {
  return planCrud.update(id, input);
}

export async function deletePlan(id: string) {
  return planCrud.delete(id);
}

/**
 * Atomic edit: patches title/summary on the plan row and appends a body
 * revision when the body actually changed. Title/summary edits alone do not
 * create a revision row — the revisions log is body-only.
 */
export async function savePlanRevision(args: {
  planId: string;
  title: string;
  summary: string | null;
  body: string;
  changeNote?: string;
}) {
  const existing = await planCrud.get(args.planId);
  if (!existing) throw new Error("Plan not found");

  const titleChanged = existing.title !== args.title;
  const summaryChanged = (existing.summary ?? null) !== args.summary;
  const bodyChanged = (existing.body ?? "") !== args.body;
  if (titleChanged || summaryChanged) {
    await planCrud.update(args.planId, { title: args.title, summary: args.summary });
  }

  if (bodyChanged) {
    await appendPlanRevision({
      planArtifactId: args.planId,
      body: args.body,
      changeNote: args.changeNote,
    });
  }

  // Jira sync is intentionally manual/global-button driven so saved Coznt
  // revisions remain visible as pending Jira pushes.
}

export async function pushPlanArtifactToRepo(args: {
  planId: string;
  directoryName: string;
  fileName: string;
  branchName: string;
  baseBranch?: string;
  repositoryIdentifier: string;
}) {
  const ctx = await getActionContext();
  const plan = await planCrud.get(args.planId);
  if (!plan) {
    return { ok: false as const, error: "Plan not found." };
  }

  const repository = await db.query.repositories.findFirst({
    where: and(
      eq(repositories.organizationId, ctx.organizationId),
      eq(repositories.projectId, plan.projectId),
      eq(repositories.source, "github"),
      eq(repositories.identifier, args.repositoryIdentifier),
    ),
  });

  if (!repository) {
    return { ok: false as const, error: "Connected GitHub repository not found for this project." };
  }

  const ownerRepo = deriveOwnerRepo(repository);
  const baseBranch = args.baseBranch?.trim() || repository.defaultBranch || "main";
  const directoryName = normalizeDirectory(args.directoryName);
  const fileName = normalizeFileName(args.fileName);
  const path = `${directoryName}${fileName}`;
  const content = stringifyFrontmatter(
    {
      kind: plan.kind,
      slug: plan.slug || plan.id,
      title: plan.title,
      summary: plan.summary ?? undefined,
      priority: plan.priority ?? undefined,
      externalRef: plan.externalRef ?? undefined,
      details: (plan.details as Record<string, unknown> | null) ?? undefined,
    },
    plan.body?.trim() || "_No body yet._",
  );

  const prTitle = `coznt: push ${plan.kind} ${plan.slug || plan.id}`;
  const prBody = `Push plan artifact from Coznt.\n\n- Plan: ${plan.title}\n- Kind: ${plan.kind}\n- File: ${path}`;

  const installationId = await findInstallationForRepo(ownerRepo);
  let pr: { number: number; url: string } | null = null;

  if (installationId) {
    const baseSha = await getBranchSha({
      installationId,
      ownerRepo,
      branch: baseBranch,
    });
    if (!baseSha) {
      return { ok: false as const, error: `Base branch "${baseBranch}" was not found.` };
    }

    const branchCreated = await createBranchRef({
      installationId,
      ownerRepo,
      newBranch: args.branchName,
      fromSha: baseSha,
    });
    if (!branchCreated) {
      return { ok: false as const, error: `Branch "${args.branchName}" already exists.` };
    }

    await putFileContent({
      installationId,
      ownerRepo,
      branch: args.branchName,
      path,
      content,
      message: `coznt: push ${path}`,
    });

    pr = await createPullRequest({
      installationId,
      ownerRepo,
      title: prTitle,
      body: prBody,
      headBranch: args.branchName,
      baseBranch,
    });
  } else {
    const oauthToken = await getGitHubAccessToken({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });
    if (!oauthToken) {
      return {
        ok: false as const,
        error: "GitHub App is not installed for this repository, and GitHub OAuth is not connected for your user.",
      };
    }

    const [owner, repoName] = splitOwnerRepo(ownerRepo);
    const github = new GitHubClient(oauthToken);

    const baseSha = await github.getBranchSha(owner, repoName, baseBranch);
    if (!baseSha) {
      return { ok: false as const, error: `Base branch "${baseBranch}" was not found.` };
    }

    const branchCreated = await github.createBranchRef(owner, repoName, args.branchName, baseSha);
    if (!branchCreated) {
      return { ok: false as const, error: `Branch "${args.branchName}" already exists.` };
    }

    await github.createOrUpdateFile(owner, repoName, path, content, `coznt: push ${path}`, undefined, args.branchName);
    const createdPr = await github.createPullRequest(owner, repoName, prTitle, prBody, args.branchName, baseBranch);
    pr = { number: createdPr.number, url: createdPr.html_url };
  }

  if (!pr) {
    return { ok: false as const, error: "Failed to open pull request for pushed plan." };
  }

  return {
    ok: true as const,
    prUrl: pr.url,
    baseBranch,
    directoryName,
    fileName,
    branchName: args.branchName,
    repositoryIdentifier: repository.identifier,
  };
}

function normalizeDirectory(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return ".agents/plans/";
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function normalizeFileName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("File name is required.");
  return trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`;
}

function deriveOwnerRepo(repo: { identifier: string; url: string | null }): string {
  if (repo.identifier) return repo.identifier.replace(/^github:/, "");
  if (repo.url) {
    const m = repo.url.match(/github\.com[/:]+([^/]+\/[^/.]+)/);
    if (m) return m[1];
  }
  throw new Error("Cannot derive owner/repo from repository.");
}

function splitOwnerRepo(ownerRepo: string): [string, string] {
  const [owner, repo] = ownerRepo.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid GitHub repository identifier: "${ownerRepo}"`);
  }
  return [owner, repo];
}

export { listPlansByProject, appendPlanRevision, listPlanRevisions };
