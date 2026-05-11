/**
 * Postgres-backed sliding-window rate limiter.
 *
 * Single-row UPSERT: if the window has expired, reset count=1 and
 * windowStart=now; otherwise increment. Returns whether the caller is
 * still under the limit.
 *
 * Good enough for current scale + single-instance deploys. Swap for
 * Upstash/Redis when traffic justifies.
 *
 * Usage:
 *   const result = await checkRateLimit({
 *     key: `claim:ip:${ip}`,
 *     max: 30,
 *     windowMs: 10 * 60_000,
 *   });
 *   if (!result.ok) return new NextResponse("rate_limited", { status: 429 });
 */

import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { rateLimits } from "@/db/schema";

export interface RateLimitInput {
  /** Unique bucket key — namespace freely, e.g. "claim:ip:1.2.3.4". */
  key: string;
  /** Max events allowed inside the window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  count: number;
  remaining: number;
  resetMs: number;
}

export async function checkRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const { key, max, windowMs } = input;
  const windowSeconds = Math.ceil(windowMs / 1000);

  // INSERT ... ON CONFLICT lets us atomically reset-or-increment in one
  // round trip. The CASE in the UPDATE arm checks if the existing window
  // has expired (start+windowSeconds < now); if so, reset count to 1 and
  // windowStart to now. Otherwise count = count + 1.
  const result = await db.execute<{
    count: number;
    window_start: Date;
  }>(sql`
    INSERT INTO ${rateLimits} (key, count, window_start)
    VALUES (${key}, 1, NOW())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN ${rateLimits.windowStart} + (${windowSeconds} * INTERVAL '1 second') < NOW()
          THEN 1
        ELSE ${rateLimits.count} + 1
      END,
      window_start = CASE
        WHEN ${rateLimits.windowStart} + (${windowSeconds} * INTERVAL '1 second') < NOW()
          THEN NOW()
        ELSE ${rateLimits.windowStart}
      END
    RETURNING count, window_start
  `);

  const rows = (result as unknown as { rows?: Array<{ count: number; window_start: Date }> }).rows
    ?? (result as unknown as Array<{ count: number; window_start: Date }>);
  const row = Array.isArray(rows) ? rows[0] : undefined;
  const count = row?.count ?? 1;
  const windowStart = row?.window_start ?? new Date();
  const startMs = windowStart instanceof Date ? windowStart.getTime() : new Date(windowStart).getTime();
  const resetMs = Math.max(0, startMs + windowMs - Date.now());

  return {
    ok: count <= max,
    count,
    remaining: Math.max(0, max - count),
    resetMs,
  };
}

/**
 * Read the client IP from a NextRequest. Trusts the leftmost `x-forwarded-for`
 * entry (this assumes a known proxy in front; document this for the deploy).
 */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}
