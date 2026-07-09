import { describe, expect, it } from "vitest";
import {
  preparePrSummaryDiff,
  resolvePrSummaryDiffPolicy,
  shouldRunPrSummaryReview,
} from "./pr-summary-review";
import {
  COZNT_CAT_SUMMARY_MARKER,
  renderPrSummaryMarkdown,
} from "./pr-summary-markdown";
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

  it("omits noisy generated patches while preserving file metadata", () => {
    const diff = preparePrSummaryDiff([
      file({
        filename: "drizzle/meta/0005_snapshot.json",
        additions: 1000,
        deletions: 500,
        patch: "+large generated snapshot",
      }),
      file({
        filename: "logs/app.log",
        additions: 10,
        deletions: 0,
        patch: "+runtime log",
      }),
    ]);

    expect(diff.totalPatchChars).toBe(0);
    expect(diff.files[0]).toMatchObject({
      filename: "drizzle/meta/0005_snapshot.json",
      patch: null,
      patchOmittedReason: expect.stringContaining("Drizzle ORM snapshot"),
    });
    expect(diff.files[1]).toMatchObject({
      filename: "logs/app.log",
      patch: null,
      patchOmittedReason: expect.stringContaining("Log output"),
    });
  });

  it("caps SQL migration patches to a small reviewable slice", () => {
    const diff = preparePrSummaryDiff([
      file({
        filename: "drizzle/0005_project_artifact_status.sql",
        patch: `+${"x".repeat(2_000)}`,
      }),
    ]);

    expect(diff.files[0].patch).toHaveLength(1_500);
    expect(diff.files[0].patchOmittedReason).toBeNull();
    expect(diff.files[0].truncatedPatch).toBe(true);
  });
});

describe("resolvePrSummaryDiffPolicy", () => {
  it("classifies noisy generated stack areas", () => {
    expect(resolvePrSummaryDiffPolicy("drizzle/meta/0000_snapshot.json").includePatch).toBe(false);
    expect(resolvePrSummaryDiffPolicy(".next/server/app.js").includePatch).toBe(false);
    expect(resolvePrSummaryDiffPolicy("venv/lib/python/site.py").includePatch).toBe(false);
    expect(resolvePrSummaryDiffPolicy("server.log").includePatch).toBe(false);
    expect(resolvePrSummaryDiffPolicy("src/app/page.tsx").includePatch).toBe(true);
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
      issueComments: [{ author: "reviewer", body: "Please explain migration safety." }],
      reviewComments: [
        {
          author: "reviewer",
          body: "This branch needs a null check.",
          path: "src/inventory.ts",
          line: 14,
          inReplyToId: null,
        },
      ],
    });

    expect(prompt).toContain("Add inventory API");
    expect(prompt).toContain("Creates inventory endpoints.");
    expect(prompt).toContain("src/inventory.ts");
    expect(prompt).toContain("@@ -1 +1 @@");
    expect(prompt).toContain("Only 1 of 3 changed files were included.");
    expect(prompt).toContain("One or more patches were truncated.");
    expect(prompt).toContain("Please explain migration safety.");
    expect(prompt).toContain("src/inventory.ts:14");
  });
});

describe("renderPrSummaryMarkdown", () => {
  it("renders an idempotent Coznt Cat summary comment without extra template sections", () => {
    const diff = preparePrSummaryDiff([
      file({
        filename: "src/app/api/inventory/route.ts",
        additions: 100,
        deletions: 20,
      }),
      file({
        filename: "src/components/InventoryTable.tsx",
        additions: 40,
        deletions: 10,
      }),
    ]);

    const markdown = renderPrSummaryMarkdown({
      ownerRepo: "acme/scm",
      pullNumber: 42,
      prTitle: "Fix inventory API for PR #41",
      prBody: [
        "## PR Author-generated Summary",
        "",
        "Fixes #4521 by adding safer stock movement validation.",
        "",
        "## CodeRabbit-generated Summary",
        "",
        "This generated text must not be copied into the author summary.",
      ].join("\n"),
      headSha: "head",
      review: {
        summary: "Adds safer inventory validation and updates the UI table.",
        files: [
          {
            path: "src/app/api/inventory/route.ts",
            status: "modified",
            additions: 100,
            deletions: 20,
            changeSummary: "Validates stock movement requests before persistence.",
          },
          {
            path: "src/components/InventoryTable.tsx",
            status: "modified",
            additions: 40,
            deletions: 10,
            changeSummary: "Displays the new validation state in the inventory table.",
          },
        ],
        notableChanges: ["Adds backend validation.", "Updates frontend inventory state."],
      },
      diff,
      issueComments: [],
      reviewComments: [],
      llmUsage: {
        modelId: "openai/gpt-oss-120b",
        inputTokens: 1234,
        outputTokens: 256,
        totalTokens: 1490,
        cachedInputTokens: null,
        reasoningTokens: null,
        cacheHit: false,
        estimatedCostUsd: 0.000339,
        pricing: {
          inputUsdPer1M: 0.15,
          cachedInputUsdPer1M: 0.075,
          outputUsdPer1M: 0.60,
          source: "static",
        },
      },
      generatedAt: new Date("2026-07-06T10:00:00Z"),
    });

    expect(markdown.startsWith(COZNT_CAT_SUMMARY_MARKER)).toBe(true);
    expect(markdown).toContain("## PR Author-generated Summary");
    expect(markdown).toContain("Fixes #4521 by adding safer stock movement validation.");
    expect(markdown).not.toContain("This generated text must not be copied");
    expect(markdown).toContain("## Coznt Cat-generated Summary");
    expect(markdown).toContain("| File(s) / Path(s) | Change Summary |");
    expect(markdown).toContain("### LLM token usage and cost");
    expect(markdown).toContain("| openai/gpt-oss-120b | 1,234 | 256 | 1,490 | $0.000339 |");
    expect(markdown).toContain("#4521 - Referenced in the PR title or description.");
    expect(markdown).not.toContain("### Estimated code review effort");
    expect(markdown).not.toContain("### Pre-merge checks");
    expect(markdown).not.toContain("#### Failed checks");
    expect(markdown).not.toContain("#### Passed checks");
    expect(markdown).not.toContain("### Limitations");
    expect(markdown).not.toContain("### Sequence diagram(s)");
    expect(markdown).not.toContain("### Possibly related PRs");
    expect(markdown).not.toContain("### Suggested labels");
    expect(markdown).not.toContain("### Suggested reviewers");
    expect(markdown).not.toContain("### Finishing Touches");
    expect(markdown).not.toContain("### Review context read");
  });
});
