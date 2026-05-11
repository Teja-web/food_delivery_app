import { createHmac } from "node:crypto";

/**
 * Deterministic, non-enumerable public slug for a role.
 *
 * `slug = base64url(hmac-sha256(roleId, BETTER_AUTH_SECRET))[0..12]`
 *
 * Same role id → same slug, so re-generation is idempotent. Without the
 * secret you cannot iterate slug → role id, which keeps the public surface
 * non-enumerable even though the role id space is small.
 *
 * Coupled to `BETTER_AUTH_SECRET` — rotating that invalidates every public
 * role URL (bookmarks, OG image cache, sitemap, referral links).
 */
function getSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("BETTER_AUTH_SECRET must be set in production");
    }
    return "dev-only-slug-secret-do-not-rely-on-this";
  }
  return secret;
}

export function rolePublicSlug(roleId: string): string {
  return createHmac("sha256", getSecret())
    .update(roleId)
    .digest("base64url")
    .slice(0, 12);
}
