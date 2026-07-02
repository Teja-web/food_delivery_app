/**
 * Jira webhook HMAC verification.
 *
 * Jira signs webhook deliveries with an X-Hub-Signature value such as
 * `sha256=<hex>` when a webhook secret is configured. We verify against
 * COZNT_JIRA_WEBHOOK_SECRET so Jira webhooks do not need a Coznt API key.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const JIRA_SIGNATURE_HEADERS = ["x-hub-signature", "x-hub-signature-256"] as const;

export type JiraHmacVerification =
  | { ok: true }
  | { ok: false; reason: "missing-secret" | "missing-signature" | "bad-format" | "mismatch" };

export function verifyJiraSignature(
  rawBody: string,
  signature: string | null,
): JiraHmacVerification {
  const secret = process.env.COZNT_JIRA_WEBHOOK_SECRET;
  if (!secret) return { ok: false, reason: "missing-secret" };
  if (!signature) return { ok: false, reason: "missing-signature" };
  if (!signature.startsWith("sha256=")) return { ok: false, reason: "bad-format" };

  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false, reason: "mismatch" };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "mismatch" };
}
