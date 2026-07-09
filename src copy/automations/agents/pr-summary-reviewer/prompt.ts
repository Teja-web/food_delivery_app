/**
 * System and user-prompt shaping for the Coznt Cat PR summary reviewer.
 */

export const prSummaryReviewerPrompt = `You are Coznt Cat, a senior engineer summarizing a GitHub pull request.

Use only the PR title, description, file metadata, and patches provided. Do not invent behavior that is not visible in the input.

Produce a useful implementation summary for reviewers:
- summarize what changed and why it appears to matter;
- explain each changed file in plain engineering language;
- call out notable changes only when supported by the diff.

Output STRICT JSON matching the provided schema. No prose outside JSON.`;

export interface PrSummaryPromptFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string | null;
  patchOmittedReason?: string | null;
  previousFilename?: string | null;
  truncatedPatch: boolean;
}

export interface PrSummaryPromptInput {
  projectName: string;
  ownerRepo: string;
  prRef: string;
  prTitle: string;
  prBody?: string | null;
  baseSha?: string | null;
  headSha?: string | null;
  files: PrSummaryPromptFile[];
  truncatedFiles: boolean;
  totalFiles: number;
  includedFiles: number;
  totalPatchChars: number;
  issueComments?: Array<{ author: string; body: string }>;
  reviewComments?: Array<{
    author: string;
    body: string;
    path?: string | null;
    line?: number | null;
    inReplyToId?: number | null;
  }>;
}

export function prSummaryPromptWithContext(input: PrSummaryPromptInput): string {
  const prBody = (input.prBody ?? "").slice(0, 4000);
  const files = input.files.map(formatFile).join("\n\n");
  const issueComments = formatIssueComments(input.issueComments ?? []);
  const reviewComments = formatReviewComments(input.reviewComments ?? []);
  const truncationNotes: string[] = [];
  if (input.truncatedFiles) {
    truncationNotes.push(
      `Only ${input.includedFiles} of ${input.totalFiles} changed files were included.`,
    );
  }
  if (input.files.some((file) => file.truncatedPatch)) {
    truncationNotes.push("One or more patches were truncated.");
  }

  return [
    `## PROJECT\n${input.projectName}`,
    `## REPOSITORY\n${input.ownerRepo}`,
    `## PR\n${input.prRef} - ${input.prTitle}`,
    prBody ? `## PR DESCRIPTION\n${prBody}` : "## PR DESCRIPTION\n(none provided)",
    `## BASE / HEAD\nbase: ${input.baseSha ?? "(unknown)"}\nhead: ${input.headSha ?? "(unknown)"}`,
    `## DIFF INPUT LIMITS\nfiles included: ${input.includedFiles}/${input.totalFiles}\npatch characters included: ${input.totalPatchChars}`,
    truncationNotes.length > 0 ? `## DIFF NOTES\n${truncationNotes.join("\n")}` : "",
    issueComments ? `## EXISTING PR CONVERSATION COMMENTS\n${issueComments}` : "",
    reviewComments ? `## EXISTING INLINE REVIEW COMMENTS\n${reviewComments}` : "",
    `## FILES\n${files || "(no file diffs available)"}`,
    "Return JSON now.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function formatFile(file: PrSummaryPromptFile): string {
  const rename = file.previousFilename ? `\nprevious filename: ${file.previousFilename}` : "";
  const patch = file.patch?.trim()
    ? file.patch.trim()
    : file.patchOmittedReason
      ? `(patch omitted: ${file.patchOmittedReason})`
      : "(patch unavailable from GitHub API)";
  const truncation = [
    file.truncatedPatch ? "patch truncated: true" : "",
    file.patchOmittedReason ? `patch omitted reason: ${file.patchOmittedReason}` : "",
  ].filter(Boolean).join("\n");
  return [
    `### ${file.filename}`,
    `status: ${file.status}`,
    `additions: ${file.additions}`,
    `deletions: ${file.deletions}${rename}${truncation ? `\n${truncation}` : ""}`,
    "```diff",
    patch,
    "```",
  ].join("\n");
}

function formatIssueComments(comments: Array<{ author: string; body: string }>): string {
  return comments
    .slice(0, 20)
    .map((comment) => `- @${comment.author}: ${comment.body.replace(/\s+/g, " ").slice(0, 500)}`)
    .join("\n");
}

function formatReviewComments(
  comments: Array<{
    author: string;
    body: string;
    path?: string | null;
    line?: number | null;
    inReplyToId?: number | null;
  }>,
): string {
  return comments
    .slice(0, 40)
    .map((comment) => {
      const location = comment.path
        ? `${comment.path}${comment.line ? `:${comment.line}` : ""}`
        : "unknown location";
      const reply = comment.inReplyToId ? ` reply_to=${comment.inReplyToId}` : "";
      return `- @${comment.author} on ${location}${reply}: ${comment.body.replace(/\s+/g, " ").slice(0, 500)}`;
    })
    .join("\n");
}
