import { beforeEach, describe, expect, it, vi } from "vitest";

const insertValues: unknown[] = [];
const insertReturningQueue: unknown[][] = [];

const dbMock = {
  query: {
    skills: {
      findFirst: vi.fn(),
    },
    projects: {
      findFirst: vi.fn(),
    },
  },
  insert: vi.fn(() => {
    const chain = {
      values: vi.fn((value: unknown) => {
        insertValues.push(value);
        return chain;
      }),
      onConflictDoUpdate: vi.fn(() => chain),
      returning: vi.fn(async () => insertReturningQueue.shift() ?? []),
    };
    return chain;
  }),
};

const generateMock = vi.fn();
const listFilesMock = vi.fn();
const listCommentsMock = vi.fn();
const listReviewCommentsMock = vi.fn();
const createIssueCommentMock = vi.fn();
const updateIssueCommentMock = vi.fn();
const isGithubAppConfiguredMock = vi.fn();
const findInstallationForRepoMock = vi.fn();
const artifactsPromptMock = vi.fn();
const recordSkillOutcomeMock = vi.fn();

vi.mock("@/db/client", () => ({ db: dbMock }));
vi.mock("@/lib/ai", () => ({
  DEFAULT_MODEL: "gpt-4o-mini",
  generate: generateMock,
}));
vi.mock("@/lib/integrations/github-app", () => ({
  listPullRequestFilesWithPatches: listFilesMock,
  listPullRequestComments: listCommentsMock,
  listPullRequestReviewComments: listReviewCommentsMock,
  createIssueComment: createIssueCommentMock,
  updateIssueComment: updateIssueCommentMock,
  isConfigured: isGithubAppConfiguredMock,
  findInstallationForRepo: findInstallationForRepoMock,
}));
vi.mock("@/operations/artifacts", () => ({
  buildProjectArtifactsPromptBlock: artifactsPromptMock,
}));
vi.mock("@/operations/skill/skill-autonomy", () => ({
  recordSkillOutcome: recordSkillOutcomeMock,
}));

const { runPrSummaryReviewTask } = await import("./pr-summary-review");

const baseInput = {
  organizationId: "org-1",
  projectId: "proj-1",
  ownerRepo: "acme/scm",
  installationId: "123",
  pullNumber: 42,
  action: "opened",
  draft: false,
  prTitle: "Add inventory workflow",
  prBody: "Adds stock movement endpoints.",
  prUrl: "https://github.com/acme/scm/pull/42",
  baseSha: "base",
  headSha: "head",
  webhookEventId: "webhook-1",
};

describe("runPrSummaryReviewTask", () => {
  beforeEach(() => {
    insertValues.length = 0;
    insertReturningQueue.length = 0;
    vi.clearAllMocks();
    dbMock.query.skills.findFirst.mockResolvedValue(null);
    dbMock.query.projects.findFirst.mockResolvedValue({ id: "proj-1", name: "SCM" });
    insertReturningQueue.push([{ id: "skill-1" }], [{ id: "intel-1" }]);
    listFilesMock.mockResolvedValue([
      {
        sha: "abc",
        filename: "src/inventory.ts",
        status: "modified",
        additions: 12,
        deletions: 2,
        changes: 14,
        patch: "@@ -1 +1 @@\n-old\n+new",
        previousFilename: null,
      },
    ]);
    artifactsPromptMock.mockResolvedValue("# Effective Project Artifacts\nFollow the rules.");
    recordSkillOutcomeMock.mockResolvedValue({ id: "outcome-1" });
    isGithubAppConfiguredMock.mockReturnValue(true);
    findInstallationForRepoMock.mockResolvedValue(null);
    listCommentsMock.mockResolvedValue([
      {
        id: 10,
        author: "reviewer",
        body: "Please cover inventory edge cases.",
        url: "https://github.com/acme/scm/pull/42#issuecomment-10",
        createdAt: "2026-07-06T10:00:00Z",
        updatedAt: "2026-07-06T10:00:00Z",
      },
    ]);
    listReviewCommentsMock.mockResolvedValue([
      {
        id: 20,
        author: "reviewer",
        body: "This branch needs a null check.",
        url: "https://github.com/acme/scm/pull/42#discussion_r20",
        path: "src/inventory.ts",
        line: 12,
        position: 4,
        diffHunk: "@@ -1 +1 @@",
        inReplyToId: null,
        pullRequestReviewId: 7,
        createdAt: "2026-07-06T10:01:00Z",
        updatedAt: "2026-07-06T10:01:00Z",
      },
    ]);
    createIssueCommentMock.mockResolvedValue({
      id: 99,
      url: "https://github.com/acme/scm/pull/42#issuecomment-99",
    });
    updateIssueCommentMock.mockResolvedValue({
      id: 98,
      url: "https://github.com/acme/scm/pull/42#issuecomment-98",
    });
  });

  it("stores and audits a generated PR summary", async () => {
    generateMock.mockResolvedValue({
      text: '{"summary":"Inventory workflow added for review."}',
      object: {
        summary: "Inventory workflow added for review.",
        files: [
          {
            path: "src/inventory.ts",
            status: "modified",
            additions: 12,
            deletions: 2,
            changeSummary: "Updates inventory behavior.",
          },
        ],
        notableChanges: ["Adds inventory workflow."],
      },
      usage: {
        modelId: "gpt-4o-mini",
        inputTokens: 1000,
        outputTokens: 200,
        totalTokens: 1200,
        cachedInputTokens: null,
        reasoningTokens: null,
        cacheHit: false,
        estimatedCostUsd: 0.00027,
        pricing: {
          inputUsdPer1M: 0.15,
          cachedInputUsdPer1M: null,
          outputUsdPer1M: 0.60,
          source: "static",
        },
      },
    });

    const result = await runPrSummaryReviewTask(baseInput);

    expect(result?.intelligenceId).toBe("intel-1");
    expect(listFilesMock).toHaveBeenCalledWith({
      installationId: "123",
      ownerRepo: "acme/scm",
      pullNumber: 42,
    });
    expect(listCommentsMock).toHaveBeenCalledWith({
      installationId: "123",
      ownerRepo: "acme/scm",
      pullNumber: 42,
    });
    expect(listReviewCommentsMock).toHaveBeenCalledWith({
      installationId: "123",
      ownerRepo: "acme/scm",
      pullNumber: 42,
    });
    expect(generateMock.mock.calls[0][0].prompt).toContain("Please cover inventory edge cases.");
    expect(generateMock.mock.calls[0][0].prompt).toContain("src/inventory.ts:12");
    expect(generateMock.mock.calls[0][0].agent.systemPrompt).toContain(
      "# Effective Project Artifacts",
    );
    expect(createIssueCommentMock).toHaveBeenCalledWith({
      installationId: "123",
      ownerRepo: "acme/scm",
      issueNumber: 42,
      body: expect.stringContaining("## Coznt Cat-generated Summary"),
    });
    expect(updateIssueCommentMock).not.toHaveBeenCalled();
    expect(insertValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "succeeded", taskId: "agent:coznt-cat-pr-summary" }),
        expect.objectContaining({
          kind: "pr-summary-review",
          entityId: "github:acme/scm#42",
          data: expect.objectContaining({
            pr: expect.objectContaining({ title: "Add inventory workflow" }),
            diff: expect.objectContaining({ totalFiles: 1, includedFiles: 1 }),
            llmUsage: expect.objectContaining({
              totalTokens: 1200,
              estimatedCostUsd: 0.00027,
            }),
            githubWriteback: expect.objectContaining({
              action: "created",
              commentId: 99,
            }),
          }),
        }),
        expect.objectContaining({
          action: "github.pr_summary.commented",
          entityId: "github:acme/scm#42",
        }),
        expect.objectContaining({
          action: "github.pr_summary.generated",
          entityId: "github:acme/scm#42",
          summary: expect.stringContaining("created the GitHub PR comment"),
        }),
      ]),
    );
    expect(recordSkillOutcomeMock).toHaveBeenCalledWith({
      skillId: "skill-1",
      projectId: "proj-1",
      invocationId: expect.any(String),
      verdict: "success",
    });
  });

  it("updates the existing Coznt Cat summary comment when the marker is present", async () => {
    listCommentsMock.mockResolvedValue([
      {
        id: 1234,
        author: "coznt-cat",
        body: "<!-- coznt-cat-summary:v1 ownerRepo=acme/scm pull=42 sha=old -->\nold summary",
        url: "https://github.com/acme/scm/pull/42#issuecomment-1234",
        createdAt: "2026-07-06T10:00:00Z",
        updatedAt: "2026-07-06T10:00:00Z",
      },
    ]);
    generateMock.mockResolvedValue({
      text: '{"summary":"Inventory workflow refreshed for review."}',
      object: {
        summary: "Inventory workflow refreshed for review.",
        files: [
          {
            path: "src/inventory.ts",
            status: "modified",
            additions: 12,
            deletions: 2,
            changeSummary: "Updates inventory behavior.",
          },
        ],
        notableChanges: ["Refreshes inventory workflow."],
      },
    });

    const result = await runPrSummaryReviewTask(baseInput);

    expect(result?.intelligenceId).toBe("intel-1");
    expect(createIssueCommentMock).not.toHaveBeenCalled();
    expect(updateIssueCommentMock).toHaveBeenCalledWith({
      installationId: "123",
      ownerRepo: "acme/scm",
      commentId: 1234,
      body: expect.stringContaining("Inventory workflow refreshed for review."),
    });
  });

  it("resolves the GitHub App installation from the repo when webhook payload omits it", async () => {
    findInstallationForRepoMock.mockResolvedValue("456");
    generateMock.mockResolvedValue({
      text: '{"summary":"Inventory workflow added for review."}',
      object: {
        summary: "Inventory workflow added for review.",
        files: [
          {
            path: "src/inventory.ts",
            status: "modified",
            additions: 12,
            deletions: 2,
            changeSummary: "Updates inventory behavior.",
          },
        ],
        notableChanges: ["Adds inventory workflow."],
      },
    });

    const result = await runPrSummaryReviewTask({
      ...baseInput,
      installationId: null,
    });

    expect(result?.intelligenceId).toBe("intel-1");
    expect(findInstallationForRepoMock).toHaveBeenCalledWith("acme/scm");
    expect(listFilesMock).toHaveBeenCalledWith({
      installationId: "456",
      ownerRepo: "acme/scm",
      pullNumber: 42,
    });
    expect(createIssueCommentMock).toHaveBeenCalledWith({
      installationId: "456",
      ownerRepo: "acme/scm",
      issueNumber: 42,
      body: expect.stringContaining("## Coznt Cat-generated Summary"),
    });
    expect(insertValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "pr-summary-review",
          data: expect.objectContaining({
            pr: expect.objectContaining({
              payloadInstallationId: null,
              resolvedInstallationId: "456",
            }),
            githubWriteback: expect.objectContaining({
              action: "created",
              commentId: 99,
            }),
          }),
        }),
      ]),
    );
  });

  it("skips GitHub UI writeback when the GitHub App credentials are missing", async () => {
    isGithubAppConfiguredMock.mockReturnValue(false);
    generateMock.mockResolvedValue({
      text: '{"summary":"Inventory workflow added for review."}',
      object: {
        summary: "Inventory workflow added for review.",
        files: [
          {
            path: "src/inventory.ts",
            status: "modified",
            additions: 12,
            deletions: 2,
            changeSummary: "Updates inventory behavior.",
          },
        ],
        notableChanges: ["Adds inventory workflow."],
      },
    });

    const result = await runPrSummaryReviewTask(baseInput);

    expect(result?.intelligenceId).toBe("intel-1");
    expect(listCommentsMock).not.toHaveBeenCalled();
    expect(listReviewCommentsMock).not.toHaveBeenCalled();
    expect(createIssueCommentMock).not.toHaveBeenCalled();
    expect(updateIssueCommentMock).not.toHaveBeenCalled();
    expect(insertValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "pr-summary-review",
          data: expect.objectContaining({
            githubWriteback: expect.objectContaining({
              skipped: true,
              reason: "GitHub App credentials are not configured",
            }),
          }),
        }),
        expect.objectContaining({
          action: "github.pr_summary.generated",
          summary: expect.stringContaining("writeback was skipped"),
        }),
      ]),
    );
  });

  it("skips GitHub UI writeback when no app installation can be found for the repo", async () => {
    findInstallationForRepoMock.mockResolvedValue(null);
    generateMock.mockResolvedValue({
      text: '{"summary":"Inventory workflow added for review."}',
      object: {
        summary: "Inventory workflow added for review.",
        files: [
          {
            path: "src/inventory.ts",
            status: "modified",
            additions: 12,
            deletions: 2,
            changeSummary: "Updates inventory behavior.",
          },
        ],
        notableChanges: ["Adds inventory workflow."],
      },
    });

    const result = await runPrSummaryReviewTask({
      ...baseInput,
      installationId: null,
    });

    expect(result?.intelligenceId).toBe("intel-1");
    expect(findInstallationForRepoMock).toHaveBeenCalledWith("acme/scm");
    expect(createIssueCommentMock).not.toHaveBeenCalled();
    expect(insertValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "pr-summary-review",
          data: expect.objectContaining({
            githubWriteback: expect.objectContaining({
              skipped: true,
              reason: expect.stringContaining("no installed Coznt GitHub App was found for acme/scm"),
            }),
          }),
        }),
      ]),
    );
  });

  it("records failed automation and audit rows when generation fails", async () => {
    generateMock.mockRejectedValue(new Error("model unavailable"));

    const result = await runPrSummaryReviewTask(baseInput);

    expect(result).toBeNull();
    expect(insertValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "failed",
          errorMessage: "model unavailable",
          taskId: "agent:coznt-cat-pr-summary",
        }),
        expect.objectContaining({
          action: "github.pr_summary.failed",
          entityId: "github:acme/scm#42",
          after: expect.objectContaining({ error: "model unavailable" }),
        }),
      ]),
    );
    expect(recordSkillOutcomeMock).toHaveBeenCalledWith({
      skillId: "skill-1",
      projectId: "proj-1",
      invocationId: expect.any(String),
      verdict: "incident",
      severity: "high",
    });
  });
});
