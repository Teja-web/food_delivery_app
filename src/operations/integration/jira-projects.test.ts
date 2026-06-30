import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  JiraProjectMissingError,
  ensureJiraProjectExists,
  previewJiraProject,
  syncJiraProjectWorkItems,
} from "./jira-projects";
import { upsertWorkItem } from "@/operations/work/work-items";

const mockClient = {
  getProject: vi.fn(),
  validateProjectKey: vi.fn(),
  createProject: vi.fn(),
  getBoardsForProject: vi.fn(),
  getIssues: vi.fn(),
};

vi.mock("@/lib/integrations/clients", () => ({
  getJiraClient: vi.fn(async () => mockClient),
}));

vi.mock("@/operations/work/work-items", () => ({
  upsertWorkItem: vi.fn(),
}));

describe("jira project integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.getProject.mockResolvedValue({
      id: "10001",
      key: "ACME",
      name: "Acme",
      url: "https://acme.atlassian.net/browse/ACME",
    });
    mockClient.validateProjectKey.mockResolvedValue({ valid: true, errors: [] });
    mockClient.createProject.mockResolvedValue({
      id: "10002",
      key: "NEW",
      name: "New Project",
      url: "https://acme.atlassian.net/browse/NEW",
    });
    mockClient.getBoardsForProject.mockResolvedValue([
      {
        id: 42,
        name: "Acme board",
        type: "kanban",
        url: "https://acme.atlassian.net/jira/software/projects/ACME/boards/42",
      },
    ]);
    mockClient.getIssues.mockResolvedValue([]);
  });

  it("previews an existing Jira project and its boards", async () => {
    const preview = await previewJiraProject("org_1", "acme");

    expect(mockClient.getProject).toHaveBeenCalledWith("ACME");
    expect(mockClient.getBoardsForProject).toHaveBeenCalledWith("ACME");
    expect(preview).toMatchObject({
      key: "ACME",
      exists: true,
      boards: [{ id: 42, name: "Acme board", type: "kanban" }],
    });
  });

  it("requires explicit approval before creating a missing Jira project", async () => {
    mockClient.getProject.mockResolvedValue(null);

    await expect(
      ensureJiraProjectExists({
        organizationId: "org_1",
        projectKey: "new",
        projectName: "New Project",
      }),
    ).rejects.toBeInstanceOf(JiraProjectMissingError);

    expect(mockClient.createProject).not.toHaveBeenCalled();
  });

  it("creates a missing Jira project when approval is explicit", async () => {
    mockClient.getProject.mockResolvedValue(null);

    const result = await ensureJiraProjectExists({
      organizationId: "org_1",
      projectKey: "new",
      projectName: "New Project",
      createIfMissing: true,
    });

    expect(mockClient.validateProjectKey).toHaveBeenCalledWith("NEW");
    expect(mockClient.createProject).toHaveBeenCalledWith(
      expect.objectContaining({ key: "NEW", name: "New Project" }),
    );
    expect(result.created).toBe(true);
    expect(result.project.key).toBe("NEW");
  });

  it("syncs Jira issues into Coznt work items", async () => {
    mockClient.getIssues.mockResolvedValue([
      {
        id: "10001",
        key: "ACME-1",
        url: "https://acme.atlassian.net/browse/ACME-1",
        summary: "Restock bearings",
        description: "Order replacement inventory.",
        status: "To Do",
        type: "Task",
        priority: "Medium",
        assignee: null,
        reporter: "Ameen",
        labels: ["coznt-story"],
        epicKey: null,
        storyPoints: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
        resolvedAt: null,
      },
    ]);

    const count = await syncJiraProjectWorkItems({
      organizationId: "org_1",
      projectId: "proj_1",
      projectKey: "ACME",
    });

    expect(count).toBe(1);
    expect(upsertWorkItem).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        projectId: "proj_1",
        source: "jira",
        externalId: "ACME-1",
        externalUrl: "https://acme.atlassian.net/browse/ACME-1",
        kind: "task",
        title: "Restock bearings",
        status: "To Do",
      }),
    );
  });
});
