/**
 * MCP tool: propose_artifact
 *
 * Used by generator skills (adr-extractor, postmortem-drafter,
 * test-author) to author one or more `.agents/**\/*.md` files into a
 * coznt-opened PR for human review. Distinct from `invoke_skill`, which
 * is the single LLM-execution chokepoint — this tool just files the
 * skill's output.
 *
 * Lifecycle per docs/spec/dev-authoring-examples.md Examples 2-4:
 *   1. Skill calls `propose_artifact` with a list of {path, frontmatter,
 *      body, title?}
 *   2. Coznt creates a branch `coznt/<skill-slug>/<short-id>`
 *   3. Writes each artifact to the branch via the GitHub Contents API
 *   4. Opens a PR titled `coznt/<skill-slug>: <count> <kind> for <subject>`
 *   5. Returns the PR URL so the calling skill can record it in
 *      `skill_outcomes`
 *
 * MVP: server-side stub. The actual GitHub branch+commit dance is
 * deferred to v1.1 — for now we record the intent in `audit_logs` and
 * return a pending placeholder. This matches §21's "open question" but
 * surfaces the verb shape so generator skills can be authored against it.
 */

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall, getSessionProject } from "../../session";

export const proposeArtifactInput = z.object({
  artifacts: z
    .array(
      z.object({
        path: z
          .string()
          .min(1)
          .describe(
            "Repo-relative path under `.agents/`, e.g. `.agents/plans/adrs/0042-pgmq.md`.",
          ),
        frontmatter: z
          .record(z.string(), z.unknown())
          .describe("YAML frontmatter to serialize at the top of the file."),
        body: z.string().min(1).describe("Markdown body after the frontmatter."),
      }),
    )
    .min(1)
    .max(20)
    .describe("Files to propose. Capped at 20 to keep a single PR reviewable."),
  title: z
    .string()
    .min(1)
    .describe("PR title. By convention prefix with `coznt/<skill-slug>:`."),
  body: z
    .string()
    .optional()
    .describe(
      "PR body / description. Should reference the originating skill_invocation so the merge → outcome path can be wired.",
    ),
  baseBranch: z
    .string()
    .optional()
    .describe("Default branch override. Defaults to the repo's default branch."),
});

export type ProposeArtifactInput = z.infer<typeof proposeArtifactInput>;

export async function runProposeArtifact(client: CozntClient, input: ProposeArtifactInput) {
  bumpToolCall();
  const projectId = getSessionProject()?.id;
  if (!projectId) {
    throw new Error(
      "No active project. API key resolution failed — verify COZNT_API_KEY is valid.",
    );
  }

  return await client.post<{
    status: "pending" | "opened" | "skipped";
    prUrl?: string;
    prNumber?: number;
    reason?: string;
  }>(`/api/v1/projects/${encodeURIComponent(projectId)}/propose-artifact`, {
    artifacts: input.artifacts,
    title: input.title,
    body: input.body,
    baseBranch: input.baseBranch,
  });
}
