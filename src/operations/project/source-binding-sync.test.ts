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
});
