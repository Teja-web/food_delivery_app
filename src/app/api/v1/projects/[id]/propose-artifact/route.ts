/**
 * POST /api/v1/projects/[id]/propose-artifact
 *
 * Backs the `propose_artifact` MCP verb per
 * docs/spec/dev-authoring-surface.md §16 and worked Example 2
 * (adr-extractor). A generator skill posts one or more authored
 * `.agents/**\/*.md` artifacts here; coznt records the proposal in the
 * audit chain and (when GitHub App is configured for the repo)
 * opens a PR with the files for human review.
 *
 * MVP: persistence-only. The branch+commit+PR-open dance is wired
 * incrementally — when the repo has a GitHub App installation, we open
 * the PR; otherwise we record the proposal as a `propose_artifact:pending`
 * audit row and return `status: "pending"` with a tracking ID.
 *
 * The merge-webhook sync tasks (sync-skills-from-merge, etc.) re-import
 * the .agents/ files when the PR lands, so propose_artifact never writes
 * directly to the canonical tables — it only files a proposal.
 */

import { z } from "zod/v4";
import { handleApi, UnauthorizedError } from "@/lib/auth/api-key";
import { db } from "@/db/client";
import { auditLogs } from "@/db/schema/audit/audit-log";
import { repositories } from "@/db/schema/repository";
import { and, eq } from "drizzle-orm";
import { stringifyFrontmatter } from "@/lib/authoring/parse-frontmatter";
import {
  createBranchRef,
  createPullRequest,
  findInstallationForRepo,
  getBranchSha,
  putFileContent,
} from "@/lib/integrations/github-app";

const requestSchema = z.object({
  artifacts: z
    .array(
      z.object({
        path: z.string().min(1),
        frontmatter: z.record(z.string(), z.unknown()),
        body: z.string().min(1),
      }),
    )
    .min(1)
    .max(20),
  title: z.string().min(1),
  body: z.string().optional(),
  baseBranch: z.string().optional(),
});

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await context.params;
  return handleApi(req, async (ctx) => {
    if (!ctx.organizationId) throw new UnauthorizedError("missing organization");

    const json = (await req.json()) as unknown;
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return {
        status: "skipped" as const,
        reason: `invalid request: ${parsed.error.message}`,
      };
    }

    // Find a GitHub-source repository for this project. If none is connected,
    // we record the proposal but mark it pending — devs can wire the GitHub
    // App later and a backfill task can replay these proposals.
    const repo = await db.query.repositories.findFirst({
      where: and(
        eq(repositories.organizationId, ctx.organizationId),
        eq(repositories.projectId, projectId),
        eq(repositories.source, "github"),
      ),
    });

    // Pre-serialize the files so they're stored in a re-usable form.
    const serialized = parsed.data.artifacts.map((a) => ({
      path: a.path,
      content: stringifyFrontmatter(a.frontmatter, a.body),
    }));

    // Record the proposal — single audit row covering all files, with the
    // serialized payload in `after` so v1.1's PR-open task can replay.
    const inserted = await db
      .insert(auditLogs)
      .values({
        organizationId: ctx.organizationId,
        actorType: "api",
        actorId: `api:${ctx.apiKeyId}`,
        actorName: "api",
        action: "propose_artifact.filed",
        entityType: "project",
        entityId: projectId,
        summary: `proposed ${parsed.data.artifacts.length} artifact(s): ${parsed.data.title}`,
        after: {
          title: parsed.data.title,
          body: parsed.data.body ?? null,
          baseBranch: parsed.data.baseBranch ?? null,
          artifacts: serialized,
          repoConnected: Boolean(repo),
        },
        invokedVia: "mcp:propose_artifact",
      })
      .returning({ id: auditLogs.id });

    // When the repo is connected, attempt the GitHub PR open. This is
    // best-effort for MVP — failure falls back to "pending" with the
    // audit row preserving the proposal for replay.
    if (repo) {
      try {
        const url = await openProposalPr({
          ownerRepo: deriveOwnerRepo(repo),
          baseBranch: parsed.data.baseBranch ?? repo.defaultBranch ?? "main",
          title: parsed.data.title,
          body: parsed.data.body ?? "Coznt-generated artifacts. Review and merge.",
          artifacts: serialized,
          trackingAuditId: inserted[0].id,
        });
        if (url) {
          return {
            status: "opened" as const,
            prUrl: url.url,
            prNumber: url.number,
          };
        }
      } catch (err) {
        // Fall through to pending.
        await db.insert(auditLogs).values({
          organizationId: ctx.organizationId,
          actorType: "system",
          actorId: "mcp",
          actorName: "propose_artifact",
          action: "propose_artifact.error",
          entityType: "project",
          entityId: projectId,
          summary: `PR open failed: ${err instanceof Error ? err.message : String(err)}`,
          invokedVia: "mcp:propose_artifact",
        });
      }
    }

    return {
      status: "pending" as const,
      reason: repo
        ? "queued for PR open"
        : "no GitHub repository connected to this project — proposal recorded for replay",
    };
  });
}

function deriveOwnerRepo(repo: { identifier: string; url: string | null }): string {
  if (repo.identifier) return repo.identifier.replace(/^github:/, "");
  if (repo.url) {
    const m = repo.url.match(/github\.com[\/:]+([^/]+\/[^/.]+)/);
    if (m) return m[1];
  }
  throw new Error("cannot derive owner/repo from repository row");
}

/**
 * Open a coznt-authored PR with the proposed files. Resolves the GitHub App
 * installation for the repo, branches from the base, PUTs each artifact via
 * the Contents API, then opens the PR. Returns null when the GitHub App
 * isn't installed on the repo (caller falls back to "pending").
 *
 * Branch naming is deterministic — `coznt/propose/<8-char-audit-id>` — so a
 * retried call with the same audit id collides on `createBranchRef`'s 422
 * path and aborts cleanly instead of opening a duplicate PR.
 */
async function openProposalPr(args: {
  ownerRepo: string;
  baseBranch: string;
  title: string;
  body: string;
  artifacts: Array<{ path: string; content: string }>;
  trackingAuditId: string;
}): Promise<{ url: string; number: number } | null> {
  const installationId = await findInstallationForRepo(args.ownerRepo);
  if (!installationId) return null;

  const baseSha = await getBranchSha({
    installationId,
    ownerRepo: args.ownerRepo,
    branch: args.baseBranch,
  });
  if (!baseSha) {
    throw new Error(`base branch "${args.baseBranch}" not found on ${args.ownerRepo}`);
  }

  const shortId = args.trackingAuditId.slice(0, 8);
  const headBranch = `coznt/propose/${shortId}`;

  const created = await createBranchRef({
    installationId,
    ownerRepo: args.ownerRepo,
    newBranch: headBranch,
    fromSha: baseSha,
  });
  if (!created) {
    throw new Error(`branch ${headBranch} already exists — retry collided with prior proposal`);
  }

  for (const file of args.artifacts) {
    await putFileContent({
      installationId,
      ownerRepo: args.ownerRepo,
      branch: headBranch,
      path: file.path,
      content: file.content,
      message: `coznt: propose ${file.path}`,
    });
  }

  return await createPullRequest({
    installationId,
    ownerRepo: args.ownerRepo,
    title: args.title,
    body: args.body,
    headBranch,
    baseBranch: args.baseBranch,
  });
}
