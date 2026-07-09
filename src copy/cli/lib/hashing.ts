/**
 * SHA-256 hashing helper — matches the server-side algorithm used by
 * `src/operations/choreographies.ts`. Two callers producing identical
 * UTF-8 bytes MUST produce identical hex digests, byte-for-byte.
 */

import { createHash } from "node:crypto";

export function sha256(s: string): string {
  return createHash("sha256").update(s, "utf-8").digest("hex");
}
