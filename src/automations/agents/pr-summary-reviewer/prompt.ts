/**
 * System and user-prompt shaping for the Coznt Cat PR summary reviewer.
 */

export const prSummaryReviewerPrompt = `You are Coznt Cat, a senior engineer summarizing a GitHub pull request.

Use only the PR title, description, file metadata, and patches provided. Do not invent behavior that is not visible in the input.

Produce a useful implementation summary for reviewers:
- summarize what changed and why it appears to matter;
- explain each changed file in plain engineering language;
- call out notable changes only when supported by the diff;
- use limitations for missing/truncated patches or uncertainty.

Output STRICT JSON matching the provided schema. No prose outside JSON.`;

export interface PrSummaryPromptFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string | null;
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
}

export function prSummaryPromptWithContext(input: PrSummaryPromptInput): string {
  const prBody = (input.prBody ?? "").slice(0, 4000);
  const files = input.files.map(formatFile).join("\n\n");
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
    truncationNotes.length > 0 ? `## LIMITATIONS TO PRESERVE\n${truncationNotes.join("\n")}` : "",
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
    : "(patch unavailable from GitHub API)";
  const truncation = file.truncatedPatch ? "\npatch truncated: true" : "";
  return [
    `### ${file.filename}`,
    `status: ${file.status}`,
    `additions: ${file.additions}`,
    `deletions: ${file.deletions}${rename}${truncation}`,
    "```diff",
    patch,
    "```",
  ].join("\n");
}
