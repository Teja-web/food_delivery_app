import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { jiraProjectKeyFromPayload } from "@/app/api/v1/webhooks/[source]/route";
import {
  jiraExternalKeyLookupCandidates,
  normalizeJiraExternalKey,
} from "@/lib/integrations/jira-keys";
import { verifyJiraSignature } from "@/lib/integrations/jira-webhook-hmac";

const SECRET = "jira-test-secret-123";
const BODY = JSON.stringify({
  webhookEvent: "jira:issue_updated",
  issue: {
    key: "TASK-1",
    self: "https://acme.atlassian.net/rest/api/3/issue/10001",
    fields: {
      project: { key: "task" },
      summary: "Implement task API",
    },
  },
});

function signature(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifyJiraSignature", () => {
  const originalSecret = process.env.COZNT_JIRA_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.COZNT_JIRA_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.COZNT_JIRA_WEBHOOK_SECRET;
    else process.env.COZNT_JIRA_WEBHOOK_SECRET = originalSecret;
  });

  it("accepts a valid sha256 signature", () => {
    expect(verifyJiraSignature(BODY, signature(BODY, SECRET))).toEqual({ ok: true });
  });

  it("rejects invalid signatures", () => {
    expect(verifyJiraSignature(BODY, signature(BODY, "wrong-secret"))).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });
});

describe("jiraProjectKeyFromPayload", () => {
  it("extracts and normalizes the project key from an issue payload", () => {
    expect(jiraProjectKeyFromPayload(JSON.parse(BODY))).toBe("TASK");
  });

  it("falls back to a top-level project block", () => {
    expect(jiraProjectKeyFromPayload({ project: { key: "acme" } })).toBe("ACME");
  });
});

describe("jiraExternalKeyLookupCandidates", () => {
  it("prefers site-qualified keys while retaining legacy project-key fallback", () => {
    expect(
      jiraExternalKeyLookupCandidates(
        "task",
        "https://acme.atlassian.net/rest/api/3/issue/10001",
      ),
    ).toEqual(["acme.atlassian.net/TASK", "TASK"]);
  });

  it("canonicalizes URL-like site prefixes", () => {
    expect(normalizeJiraExternalKey("https://acme.atlassian.net/TASK")).toBe(
      "acme.atlassian.net/TASK",
    );
  });
});
