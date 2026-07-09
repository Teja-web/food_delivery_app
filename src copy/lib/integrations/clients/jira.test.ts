import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JiraClient } from "./jira";

describe("JiraClient", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("searches Jira issues through the paginated /search/jql endpoint", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          issues: [jiraIssue("ACME-1")],
          nextPageToken: "page-2",
          isLast: false,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          issues: [jiraIssue("ACME-2")],
          isLast: true,
        }),
      );

    const client = new JiraClient("https://acme.atlassian.net", "dev@example.com", "token");
    const issues = await client.getIssues("acme");

    expect(issues.map((issue) => issue.key)).toEqual(["ACME-1", "ACME-2"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      jql: "project = ACME ORDER BY updated DESC",
      maxResults: 100,
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      nextPageToken: "page-2",
    });
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function jiraIssue(key: string) {
  return {
    id: key.replace(/\D/g, ""),
    key,
    fields: {
      summary: `Issue ${key}`,
      description: null,
      status: { name: "To Do" },
      issuetype: { name: "Task" },
      priority: { name: "Medium" },
      assignee: null,
      reporter: { displayName: "Reporter" },
      labels: [],
      parent: null,
      customfield_10016: null,
      created: "2026-06-01T00:00:00.000Z",
      updated: "2026-06-02T00:00:00.000Z",
      resolutiondate: null,
    },
  };
}
