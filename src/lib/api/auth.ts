/**
 * Bearer-token auth for the `/api/v1` agent surface.
 *
 * The plaintext API key is presented as `Authorization: Bearer <key>`.
 * We hash with sha256 and look up in `api_keys`. On hit we install a worker
 * context with the key's org so operations can run server-side without a
 * Better Auth session.
 */

import { createHash } from "crypto";
import { and, eq, isNull, or, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKeys } from "@/db/schema/api-key";
import {
  runWithMessageContext,
  type ScopedActionContext,
} from "@/lib/auth/context";
import { eq as drizzleEq } from "drizzle-orm";

export class UnauthorizedError extends Error {
  status = 401;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

function readBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export interface ApiContext {
  organizationId: string;
  projectId: string | null;
  apiKeyId: string;
}

export async function authenticate(req: Request): Promise<ApiContext> {
  const token = readBearerToken(req);
  if (!token) throw new UnauthorizedError("Missing bearer token");

  const keyHash = hashKey(token);
  const now = new Date();
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.keyHash, keyHash),
        isNull(apiKeys.revokedAt),
        or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now)),
      ),
    )
    .limit(1);

  if (!row) throw new UnauthorizedError("Invalid or revoked API key");

  // Best-effort lastUsedAt bump; don't block the request.
  void db.update(apiKeys).set({ lastUsedAt: now }).where(drizzleEq(apiKeys.id, row.id));

  return { organizationId: row.organizationId, projectId: row.projectId, apiKeyId: row.id };
}

/** Run `fn` with an org-scoped worker context derived from the API key. */
export async function withApiContext<T>(
  ctx: ApiContext,
  fn: (ctx: ApiContext) => Promise<T>,
): Promise<T> {
  const scoped: ScopedActionContext = {
    user: { id: `api:${ctx.apiKeyId}`, name: "API client", email: "api@dilliznt" },
    organizationId: ctx.organizationId,
    userId: `api:${ctx.apiKeyId}`,
    isAdmin: false,
    role: "api",
    orgScope: (table) => eq((table as { organizationId: { name: string } }).organizationId as never, ctx.organizationId as never),
  };
  return runWithMessageContext(scoped, () => fn(ctx));
}

export async function handleApi<T>(
  req: Request,
  handler: (ctx: ApiContext) => Promise<T>,
): Promise<Response> {
  try {
    const ctx = await authenticate(req);
    const result = await withApiContext(ctx, handler);
    return Response.json(result);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return Response.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = (err as { status?: number })?.status ?? 500;
    return Response.json({ error: msg }, { status });
  }
}
