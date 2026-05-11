/**
 * Slug invariants for the public role surface.
 *
 * Public role URLs are *non-enumerable* by design: knowing one slug must not
 * help an attacker guess the next. That property hinges on (1) HMAC over a
 * secret no one outside the server has, and (2) determinism so the same role
 * always resolves to the same slug. This suite is the gate on both.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rolePublicSlug } from "@/lib/anonymize/slug";

const ORIGINAL_SECRET = process.env.BETTER_AUTH_SECRET;

describe("rolePublicSlug — determinism", () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "fixed-test-secret";
  });
  afterEach(() => {
    process.env.BETTER_AUTH_SECRET = ORIGINAL_SECRET;
  });

  it("returns the same slug for the same role id", () => {
    const id = "role_01HXXXX";
    expect(rolePublicSlug(id)).toBe(rolePublicSlug(id));
  });

  it("returns different slugs for different role ids", () => {
    expect(rolePublicSlug("role_a")).not.toBe(rolePublicSlug("role_b"));
  });

  it("emits exactly 12 characters", () => {
    expect(rolePublicSlug("role_01HXXXX")).toHaveLength(12);
  });

  it("emits only base64url characters (no padding, no '+' or '/')", () => {
    const slug = rolePublicSlug("role_01HXXXX");
    expect(slug).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(slug).not.toContain("=");
    expect(slug).not.toContain("+");
    expect(slug).not.toContain("/");
  });
});

describe("rolePublicSlug — secret coupling", () => {
  afterEach(() => {
    process.env.BETTER_AUTH_SECRET = ORIGINAL_SECRET;
  });

  it("changes the slug when BETTER_AUTH_SECRET rotates", () => {
    process.env.BETTER_AUTH_SECRET = "secret-1";
    const a = rolePublicSlug("role_x");
    process.env.BETTER_AUTH_SECRET = "secret-2";
    const b = rolePublicSlug("role_x");
    expect(a).not.toBe(b);
  });

  it("falls back to a dev-only secret when none is set (non-prod)", () => {
    delete process.env.BETTER_AUTH_SECRET;
    expect(() => rolePublicSlug("role_x")).not.toThrow();
  });
});
