import { describe, expect, it } from "vitest";
import { normalizeGitHubPrivateKey } from "@/lib/integrations/github-app";

describe("normalizeGitHubPrivateKey", () => {
  it("splits a footer glued to the final key material line", () => {
    const raw =
      "-----BEGIN RSA PRIVATE KEY-----\\nabc123=-----END RSA PRIVATE KEY-----";

    expect(normalizeGitHubPrivateKey(raw)).toBe(
      "-----BEGIN RSA PRIVATE KEY-----\nabc123=\n-----END RSA PRIVATE KEY-----",
    );
  });
});
