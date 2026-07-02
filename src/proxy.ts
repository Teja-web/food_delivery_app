/**
 * Request proxy (Next 16+ rename of `middleware.ts`).
 *
 * Centralizes rate limiting for unauthenticated/public edges. Each policy
 * declares (pattern, key, max, windowMs); a request whose path matches the
 * pattern is checked against the Postgres-backed sliding-window limiter
 * before reaching the route handler. On limit hit, returns 429 with a
 * Retry-After header — same shape regardless of which endpoint tripped.
 *
 * Why central:
 *  - Single source of truth for the policy table — easy to audit "what's
 *    rate-limited?".
 *  - New endpoints inherit the protection by adding one line here, not by
 *    remembering to call `checkRateLimit()` inside the handler.
 *  - Consistent 429 shape across all rate-limited routes.
 *
 * Server actions (e.g. createReferralAction) bypass the proxy because they
 * post to internal Next.js URLs and need per-user keys derived from the
 * session. Those keep an inline `checkRateLimit()` — but it's the only
 * remaining inline call, not five.
 *
 * Runtime: Next 16 always runs proxy.ts on Node, so no explicit `runtime`
 * export is needed (and it's now disallowed as a route segment config).
 */

import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

interface RateLimitPolicy {
  pattern: RegExp;
  key: string;
  max: number;
  windowMs: number;
}

const POLICIES: RateLimitPolicy[] = [
  // Public listing — generous; cached at the CDN edge (s-maxage=60) so most
  // bursts hit cache before us, but we still want a per-IP backstop.
  { pattern: /^\/api\/public\/opportunities(\/|$)/, key: "pub", max: 120, windowMs: 10 * 60_000 },
  // Mutating consent endpoints — strict per-IP cap. The application creation
  // is idempotent, so this defends against scrapers/abuse, not legit users.
  { pattern: /^\/api\/opportunities\/claim$/, key: "claim", max: 30, windowMs: 10 * 60_000 },
  { pattern: /^\/api\/campus\/claim$/, key: "campus", max: 30, windowMs: 10 * 60_000 },
  // Referral resolver — token enumeration defense.
  { pattern: /^\/r\/[^/]+$/, key: "r", max: 60, windowMs: 10 * 60_000 },
];

export async function proxy(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-coznt-pathname", req.nextUrl.pathname);
  const nextWithPath = () =>
    NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

  const policy = POLICIES.find((p) => p.pattern.test(req.nextUrl.pathname));
  if (!policy) return nextWithPath();

  const ip = clientIp(req.headers);
  const result = await checkRateLimit({
    key: `${policy.key}:ip:${ip}`,
    max: policy.max,
    windowMs: policy.windowMs,
  });

  if (!result.ok) {
    return new NextResponse("rate_limited", {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(result.resetMs / 1000)) },
    });
  }

  return nextWithPath();
}

/**
 * Matcher narrows which paths the proxy executes for. Keep this list in sync
 * with `POLICIES` above — the matcher is a coarse pre-filter (so we don't
 * pay proxy overhead on every static asset request); POLICIES is the precise
 * authority for what gets limited.
 */
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\..*).*)",
    "/api/public/opportunities/:path*",
    "/api/opportunities/claim",
    "/api/campus/claim",
    "/r/:token*",
  ],
};
