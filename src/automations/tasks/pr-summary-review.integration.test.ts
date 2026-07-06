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
const artifactsPromptMock = vi.fn();
const recordSkillOutcomeMock = vi.fn();

vi.mock("@/db/client", () => ({ db: dbMock }));
vi.mock("@/lib/ai", () => ({
  DEFAULT_MODEL: "gpt-4o-mini",
  generate: generateMock,
}));
vi.mock("@/lib/integrations/github-app", () => ({
  listPullRequestFilesWithPatches: listFilesMock,
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
        limitations: [],
      },
    });

    const result = await runPrSummaryReviewTask(baseInput);

    expect(result?.intelligenceId).toBe("intel-1");
    expect(listFilesMock).toHaveBeenCalledWith({
      installationId: "123",
      ownerRepo: "acme/scm",
      pullNumber: 42,
    });
    expect(generateMock.mock.calls[0][0].agent.systemPrompt).toContain(
      "# Effective Project Artifacts",
    );
    expect(insertValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "succeeded", taskId: "agent:coznt-cat-pr-summary" }),
        expect.objectContaining({
          kind: "pr-summary-review",
          entityId: "github:acme/scm#42",
          data: expect.objectContaining({
            pr: expect.objectContaining({ title: "Add inventory workflow" }),
            diff: expect.objectContaining({ totalFiles: 1, includedFiles: 1 }),
          }),
        }),
        expect.objectContaining({
          action: "github.pr_summary.generated",
          entityId: "github:acme/scm#42",
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
