import { describe, expect, it } from "vitest";
import { normalizeRepositoryInput } from "./source-binding-sync";

describe("normalizeRepositoryInput", () => {
  it("normalizes GitHub owner/repo to github.com external key", () => {
    const row = normalizeRepositoryInput({
      source: "github",
      identifier: "acme/api",
    });
    expect(row.identifier).toBe("acme/api");
    expect(row.externalKey).toBe("github.com/acme/api");
  });

  it("parses GitHub URL and keeps canonical owner/repo identifier", () => {
    const row = normalizeRepositoryInput({
      source: "github",
      identifier: "https://github.com/acme/api.git",
    });
    expect(row.identifier).toBe("acme/api");
    expect(row.externalKey).toBe("github.com/acme/api");
  });

  it("rejects malformed Jira key", () => {
    expect(() =>
      normalizeRepositoryInput({
        source: "jira",
        identifier: "https://jira.company.com/project/ACME",
      }),
    ).toThrow("Jira identifier must be a project key");
  });

  it("normalizes Jira project keys with site-qualified external keys when a URL is present", () => {
    const row = normalizeRepositoryInput({
      source: "jira",
      identifier: "task",
      url: "https://acme.atlassian.net/jira/software/projects/TASK",
    });

    expect(row.identifier).toBe("TASK");
    expect(row.externalKey).toBe("acme.atlassian.net/TASK");
  });
});
