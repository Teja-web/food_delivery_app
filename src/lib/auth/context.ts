/**
 * Action Context — org-scoped auth context for server actions and worker tasks.
 *
 * Two entry points construct a `ScopedActionContext`:
 *   - `getActionContext()`  — request-time, derives from the Better Auth session
 *   - `buildScopedContext()` — worker-time, builds from raw org + actor inputs
 *
 * Worker tasks call `runWithMessageContext(ctx, fn)` (alias: `runWithContext`)
 * so background work inherits the originating user's org without re-querying
 * the request. The `auditCreate` / `auditUpdate` methods on the context return
 * the audit-field bundles that the CRUD factory spreads into inserts/updates
 * — keeping the "who/when" provenance attached to every mutation.
 */

import { eq, SQL } from "drizzle-orm";
import { AsyncLocalStorage } from "node:async_hooks";

import { getCurrentUser } from "./actions";

export interface AuditCreateFields {
  organizationId: string;
  createdById: string;
  createdByName: string;
  updatedById: string;
  updatedByName: string;
}

export interface AuditUpdateFields {
  updatedById: string;
  updatedByName: string;
  updatedAt: Date;
}

export interface ScopedActionContext {
  user: { id: string; name: string; email: string };
  organizationId: string;
  /** Project scope when the caller carries one (API keys can be project-scoped). */
  projectId?: string | null;
  userId: string;
  isAdmin: boolean;
  role: string;
  traceId?: string;
  taskId?: string;
  /** Returns the org-scope SQL predicate for a Drizzle table with an `organizationId` column. */
  orgScope: (table: { organizationId: { name: string } } & Record<string, unknown>) => SQL;
  /** Audit bundle for inserts: organization + created-by + updated-by. */
  auditCreate: () => AuditCreateFields;
  /** Audit bundle for updates: updated-by + bumped updatedAt. */
  auditUpdate: () => AuditUpdateFields;
}

function makeOrgScope(organizationId: string): ScopedActionContext["orgScope"] {
  return (table) =>
    eq(
      (table as unknown as { organizationId: { name: string } }).organizationId as never,
      organizationId as never,
    );
}

function makeAuditCreate(
  organizationId: string,
  user: { id: string; name: string },
): () => AuditCreateFields {
  return () => ({
    organizationId,
    createdById: user.id,
    createdByName: user.name,
    updatedById: user.id,
    updatedByName: user.name,
  });
}

function makeAuditUpdate(user: { id: string; name: string }): () => AuditUpdateFields {
  return () => ({
    updatedById: user.id,
    updatedByName: user.name,
    updatedAt: new Date(),
  });
}

const messageContextStorage = new AsyncLocalStorage<ScopedActionContext>();

export function runWithMessageContext<T>(ctx: ScopedActionContext, fn: () => Promise<T>): Promise<T> {
  return messageContextStorage.run(ctx, fn);
}

/** Alias for `runWithMessageContext` — used by the worker entrypoint. */
export const runWithContext = runWithMessageContext;

export function getMessageContext(): ScopedActionContext | undefined {
  return messageContextStorage.getStore();
}

export function isWorkerContext(): boolean {
  return messageContextStorage.getStore() !== undefined;
}

/**
 * Build a `ScopedActionContext` for a worker task from raw inputs.
 *
 * The worker drains a message off pgmq and needs to wrap each task call in a
 * context — but it has no session. The message carries `organizationId` and
 * the originating user's id/name, which is enough to construct a context
 * with full audit provenance.
 */
export function buildScopedContext(
  organizationId: string,
  actor: { id: string; name: string; email?: string },
  options: { isAdmin?: boolean; role?: string; traceId?: string; taskId?: string; projectId?: string | null } = {},
): ScopedActionContext {
  const user = { id: actor.id, name: actor.name, email: actor.email ?? "" };
  return {
    user,
    organizationId,
    projectId: options.projectId ?? null,
    userId: actor.id,
    isAdmin: options.isAdmin ?? false,
    role: options.role ?? "system",
    traceId: options.traceId,
    taskId: options.taskId,
    orgScope: makeOrgScope(organizationId),
    auditCreate: makeAuditCreate(organizationId, user),
    auditUpdate: makeAuditUpdate(user),
  };
}

export async function getActionContext(): Promise<ScopedActionContext> {
  const messageCtx = messageContextStorage.getStore();
  if (messageCtx) return messageCtx;

  const { currentUser, organizationId, role, isAdmin } = await getCurrentUser();

  if (!currentUser) {
    throw new Error("Not authenticated");
  }
  if (!organizationId) {
    throw new Error("No active organization");
  }

  return {
    user: currentUser,
    organizationId,
    userId: currentUser.id,
    isAdmin,
    role,
    orgScope: makeOrgScope(organizationId),
    auditCreate: makeAuditCreate(organizationId, currentUser),
    auditUpdate: makeAuditUpdate(currentUser),
  };
}

export async function requireOrgContext(): Promise<ScopedActionContext> {
  return getActionContext();
}

/**
 * Thrown when an operation runs in a context without the required permission.
 * Distinct from "not found" so the API layer can map it to 403.
 */
export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Roles allowed to perform governance-sensitive mutations (phase advance,
 * gate override, approval policy edits). Mirrors Better Auth's
 * `member.role` for human sessions and `api_keys.role` for the agent
 * surface, so the same check works on both paths.
 */
const ELEVATED_ROLES: ReadonlySet<string> = new Set(["owner", "admin"]);

export function hasElevatedRole(ctx: { isAdmin: boolean; role: string }): boolean {
  return ctx.isAdmin || ELEVATED_ROLES.has(ctx.role);
}

export function assertElevatedRole(
  ctx: { isAdmin: boolean; role: string },
  action: string,
): void {
  if (!hasElevatedRole(ctx)) {
    throw new ForbiddenError(
      `${action} requires an admin or owner role (current role: ${ctx.role || "unknown"}).`,
    );
  }
}
