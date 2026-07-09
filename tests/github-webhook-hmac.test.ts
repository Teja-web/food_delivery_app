/**
 * HMAC verification for GitHub-App webhook deliveries.
 *
 * Pure crypto — no DB. Validates the coexisting-auth path on
 * `/api/v1/webhooks/github`.
 */

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { verifyGithubSignature } from "@/lib/integrations/github-webhook-hmac";

const SECRET = "test-secret-123";
const BODY = '{"action":"opened","number":42}';

function signature(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifyGithubSignature", () => {
  const originalSecret = process.env.COZNT_GITHUB_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.COZNT_GITHUB_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.COZNT_GITHUB_WEBHOOK_SECRET;
    else process.env.COZNT_GITHUB_WEBHOOK_SECRET = originalSecret;
  });

  it("accepts a valid sha256 signature", () => {
    const r = verifyGithubSignature(BODY, signature(BODY, SECRET));
    expect(r.ok).toBe(true);
  });

  it("rejects when the signature header is absent", () => {
    const r = verifyGithubSignature(BODY, null);
    expect(r).toEqual({ ok: false, reason: "missing-signature" });
  });

  it("rejects when the secret is not configured", () => {
    delete process.env.COZNT_GITHUB_WEBHOOK_SECRET;
    const r = verifyGithubSignature(BODY, signature(BODY, SECRET));
    expect(r).toEqual({ ok: false, reason: "missing-secret" });
  });

  it("rejects when the prefix is wrong", () => {
    const r = verifyGithubSignature(BODY, "sha1=abc123");
    expect(r).toEqual({ ok: false, reason: "bad-format" });
  });

  it("rejects when the digest mismatches", () => {
    const r = verifyGithubSignature(BODY, signature(BODY, "wrong-secret"));
    expect(r).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects when the body has been tampered with", () => {
    const sig = signature(BODY, SECRET);
    const tampered = BODY.replace("42", "43");
    const r = verifyGithubSignature(tampered, sig);
    expect(r).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects a same-prefix-different-length signature in constant time", () => {
    const r = verifyGithubSignature(BODY, "sha256=short");
    expect(r).toEqual({ ok: false, reason: "mismatch" });
  });
});
