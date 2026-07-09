/**
 * GitHub webhook HMAC verification.
 *
 * GitHub Apps sign every delivery with `sha256=<hex>` over the raw request
 * body using the App's webhook secret. We verify against
 * `COZNT_GITHUB_WEBHOOK_SECRET`.
 *
 * Constant-time comparison via `timingSafeEqual`. Returns `null` when the
 * App isn't configured for HMAC (operator hasn't set the secret yet) so
 * the caller can transparently fall back to bearer-token auth.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const GITHUB_SIGNATURE_HEADER = "x-hub-signature-256";

export type HmacVerification =
  | { ok: true }
  | { ok: false; reason: "missing-secret" | "missing-signature" | "bad-format" | "mismatch" };

export function verifyGithubSignature(rawBody: string, signature: string | null): HmacVerification {
  const secret = process.env.COZNT_GITHUB_WEBHOOK_SECRET;
  if (!secret) return { ok: false, reason: "missing-secret" };
  if (!signature) return { ok: false, reason: "missing-signature" };
  if (!signature.startsWith("sha256=")) return { ok: false, reason: "bad-format" };

  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false, reason: "mismatch" };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "mismatch" };
}

/**
 * Resolve the org for an HMAC-authenticated webhook. The signed delivery
 * doesn't carry an API key — the binding is by installation id (the
 * adapter_binding rows record which org owns which GitHub install).
 *
 * Returns null if no installation row matches (operator has the App
 * installed somewhere we don't have a binding for — webhook is dropped).
 */
export async function resolveOrgFromInstallation(
  installationId: string,
): Promise<string | null> {
  const { db } = await import("@/db/client");
  const { adapterBindings } = await import("@/db/schema/adapter-binding");
  const { and, eq, sql } = await import("drizzle-orm");
  const [row] = await db
    .select({ organizationId: adapterBindings.organizationId })
    .from(adapterBindings)
    .where(
      and(
        eq(adapterBindings.provider, "github"),
        sql`${adapterBindings.config}->>'installationId' = ${installationId}`,
      ),
    )
    .limit(1);
  return row?.organizationId ?? null;
}

/**
 * Resolve the org for an HMAC-authenticated repo-level (non-App) webhook.
 *
 * Repo and org webhooks configured via Settings → Webhooks sign deliveries
 * with `x-hub-signature-256` but the payload has no `installation.id` — the
 * only stable identifier is `repository.full_name`. We map that to the
 * `adapter_bindings.externalKey` row (`<host>/<owner>/<repo>`) and read the
 * org from there.
 *
 * `host` defaults to `github.com` and should be overridden for GHE.
 * Returns null when no binding row matches.
 */
export async function resolveOrgFromRepo(
  fullName: string,
  host: string = "github.com",
): Promise<string | null> {
  if (!fullName) return null;
  const { db } = await import("@/db/client");
  const { adapterBindings } = await import("@/db/schema/adapter-binding");
  const { and, eq } = await import("drizzle-orm");
  const externalKey = `${host}/${fullName}`;
  const [row] = await db
    .select({ organizationId: adapterBindings.organizationId })
    .from(adapterBindings)
    .where(
      and(
        eq(adapterBindings.provider, "github"),
        eq(adapterBindings.externalKey, externalKey),
      ),
    )
    .limit(1);
  return row?.organizationId ?? null;
}
