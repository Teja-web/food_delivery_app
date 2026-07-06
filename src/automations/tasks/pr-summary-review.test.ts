import { describe, expect, it } from "vitest";
import {
  preparePrSummaryDiff,
  shouldRunPrSummaryReview,
} from "./pr-summary-review";
import { prSummaryPromptWithContext } from "@/automations/agents/pr-summary-reviewer/prompt";
import type { PullRequestFileWithPatch } from "@/lib/integrations/github-app";

function file(partial: Partial<PullRequestFileWithPatch>): PullRequestFileWithPatch {
  return {
    sha: "abc",
    filename: "src/app.ts",
    status: "modified",
    additions: 1,
    deletions: 1,
    changes: 2,
    patch: "@@ -1 +1 @@\n-old\n+new",
    previousFilename: null,
    ...partial,
  };
}

describe("shouldRunPrSummaryReview", () => {
  it("runs on supported non-draft PR actions", () => {
    for (const action of ["opened", "synchronize", "reopened", "edited", "ready_for_review"]) {
      expect(shouldRunPrSummaryReview({ action, draft: false })).toBe(true);
    }
  });

  it("skips unsupported actions", () => {
    expect(shouldRunPrSummaryReview({ action: "closed", draft: false })).toBe(false);
    expect(shouldRunPrSummaryReview({ action: null, draft: false })).toBe(false);
  });

  it("skips draft PRs until they are ready for review", () => {
    expect(shouldRunPrSummaryReview({ action: "opened", draft: true })).toBe(false);
    expect(shouldRunPrSummaryReview({ action: "synchronize", draft: true })).toBe(false);
    expect(shouldRunPrSummaryReview({ action: "ready_for_review", draft: true })).toBe(true);
  });
});

describe("preparePrSummaryDiff", () => {
  it("keeps file metadata and patch text for the prompt", () => {
    const diff = preparePrSummaryDiff([
      file({ filename: "src/app.ts", additions: 10, deletions: 2 }),
      file({
        filename: "src/new.ts",
        status: "added",
        additions: 7,
        deletions: 0,
        patch: "+export const ok = true;",
      }),
    ]);

    expect(diff.totalFiles).toBe(2);
    expect(diff.includedFiles).toBe(2);
    expect(diff.truncatedFiles).toBe(false);
    expect(diff.files[0]).toMatchObject({
      filename: "src/app.ts",
      status: "modified",
      additions: 10,
      deletions: 2,
      truncatedPatch: false,
    });
    expect(diff.files[1].patch).toContain("ok");
  });

  it("truncates oversized patch input deterministically", () => {
    const largePatch = `+${"x".repeat(9_000)}`;
    const diff = preparePrSummaryDiff([file({ patch: largePatch })]);

    expect(diff.files[0].patch).toHaveLength(8_000);
    expect(diff.files[0].truncatedPatch).toBe(true);
    expect(diff.totalPatchChars).toBe(8_000);
  });

  it("caps the number of included files", () => {
    const files = Array.from({ length: 85 }, (_, index) =>
      file({ filename: `src/file-${index}.ts` }),
    );
    const diff = preparePrSummaryDiff(files);

    expect(diff.totalFiles).toBe(85);
    expect(diff.includedFiles).toBe(80);
    expect(diff.truncatedFiles).toBe(true);
  });
});

describe("prSummaryPromptWithContext", () => {
  it("includes PR metadata, files, patches, and truncation notes", () => {
    const prompt = prSummaryPromptWithContext({
      projectName: "SCM",
      ownerRepo: "acme/scm",
      prRef: "github:acme/scm#12",
      prTitle: "Add inventory API",
      prBody: "Creates inventory endpoints.",
      baseSha: "base",
      headSha: "head",
      files: [
        {
          filename: "src/inventory.ts",
          status: "modified",
          additions: 5,
          deletions: 1,
          patch: "@@ -1 +1 @@\n-old\n+new",
          previousFilename: null,
          truncatedPatch: true,
        },
      ],
      totalFiles: 3,
      includedFiles: 1,
      truncatedFiles: true,
      totalPatchChars: 20,
    });

    expect(prompt).toContain("Add inventory API");
    expect(prompt).toContain("Creates inventory endpoints.");
    expect(prompt).toContain("src/inventory.ts");
    expect(prompt).toContain("@@ -1 +1 @@");
    expect(prompt).toContain("Only 1 of 3 changed files were included.");
    expect(prompt).toContain("One or more patches were truncated.");
  });
});
