/**
 * Bearer-token auth for the `/api/v1` agent surface.
 *
 * The plaintext API key is presented as `Authorization: Bearer <key>`.
 * We hash with sha256 and look up in `api_keys`. On hit we install a worker
 * context with the key's org so operations can run server-side without a
 * Better Auth session.
 */

import { createHash, randomBytes } from "crypto";
import { and, eq, isNull, or, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKeys } from "@/db/schema/api-key";
import { automationLog } from "@/db/schema/automation-log";
import { buildScopedContext, runWithMessageContext } from "@/lib/auth/context";
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
  projectId: string;
  apiKeyId: string;
  /** Per-key authorization role. See `api_keys.role`. */
  role: string;
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

  return { organizationId: row.organizationId, projectId: row.projectId, apiKeyId: row.id, role: row.role };
}

/** Run `fn` with an org-scoped worker context derived from the API key. */
export async function withApiContext<T>(
  ctx: ApiContext,
  fn: (ctx: ApiContext) => Promise<T>,
): Promise<T> {
  const scoped = buildScopedContext(
    ctx.organizationId,
    { id: `api:${ctx.apiKeyId}`, name: "API client", email: "api@coznt" },
    { role: ctx.role, projectId: ctx.projectId },
  );
  return runWithMessageContext(scoped, () => fn(ctx));
}

/**
 * Derive a stable taskId for the automation_logs row from method + pathname.
 *
 * Examples:
 *   POST /api/v1/mcp/plans                   → "POST /api/v1/mcp/plans"
 *   GET  /api/v1/mcp/plans/abc123            → "GET /api/v1/mcp/plans/:id"
 *
 * `:id` substitution keeps cardinality bounded so the index stays useful —
 * a single plan endpoint produces one taskId across all ids.
 */
function deriveTaskId(req: Request): string {
  const url = new URL(req.url);
  const normalized = url.pathname.replace(
    /\/[A-Za-z0-9_-]{12,}(?=\/|$)/g,
    "/:id",
  );
  return `${req.method} ${normalized}`;
}

async function recordAutomationLogRow(args: {
  taskId: string;
  organizationId: string | null;
  actorId: string;
  status: "succeeded" | "failed";
  errorMessage?: string;
  durationMs: number;
  startedAt: Date;
}): Promise<void> {
  try {
    await db.insert(automationLog).values({
      id: randomBytes(10).toString("hex"),
      organizationId: args.organizationId,
      taskId: args.taskId,
      status: args.status,
      errorMessage: args.errorMessage,
      durationMs: args.durationMs,
      actorType: "api",
      actorId: args.actorId,
      createdAt: args.startedAt,
      completedAt: new Date(),
    });
  } catch {
    // Logging must never block or fail the request.
  }
}

export async function handleApi<T>(
  req: Request,
  handler: (ctx: ApiContext) => Promise<T>,
): Promise<Response> {
  const taskId = deriveTaskId(req);
  const startedAt = new Date();
  let ctx: ApiContext | null = null;

  try {
    ctx = await authenticate(req);
    const result = await withApiContext(ctx, handler);
    // Fire-and-forget the log write — request returns immediately.
    void recordAutomationLogRow({
      taskId,
      organizationId: ctx.organizationId,
      actorId: `api:${ctx.apiKeyId}`,
      status: "succeeded",
      durationMs: Date.now() - startedAt.getTime(),
      startedAt,
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      // Don't log unauthenticated noise — no actor context anyway.
      return Response.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = (err as { status?: number })?.status ?? 500;
    const details = (err as { details?: unknown })?.details;
    void recordAutomationLogRow({
      taskId,
      organizationId: ctx?.organizationId ?? null,
      actorId: ctx ? `api:${ctx.apiKeyId}` : "api:anonymous",
      status: "failed",
      errorMessage: msg,
      durationMs: Date.now() - startedAt.getTime(),
      startedAt,
    });
    return Response.json(details ? { error: msg, details } : { error: msg }, { status });
  }
}
