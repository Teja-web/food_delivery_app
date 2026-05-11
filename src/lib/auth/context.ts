/**
 * Action Context — org-scoped auth context for server actions and worker tasks.
 *
 * Worker tasks call `runWithMessageContext(ctx, fn)` so background work
 * inherits the originating user's org without re-querying the request.
 */

import { eq, SQL } from "drizzle-orm";
import { AsyncLocalStorage } from "node:async_hooks";
import { getCurrentUser } from "./actions";

export interface ScopedActionContext {
  user: { id: string; name: string; email: string };
  organizationId: string;
  userId: string;
  isAdmin: boolean;
  role: string;
  traceId?: string;
  taskId?: string;
  /** Returns the org-scope SQL predicate for a Drizzle table with an `organizationId` column. */
  orgScope: (table: { organizationId: { name: string } } & Record<string, unknown>) => SQL;
}

const messageContextStorage = new AsyncLocalStorage<ScopedActionContext>();

export function runWithMessageContext<T>(ctx: ScopedActionContext, fn: () => Promise<T>): Promise<T> {
  return messageContextStorage.run(ctx, fn);
}

export function getMessageContext(): ScopedActionContext | undefined {
  return messageContextStorage.getStore();
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
    orgScope: (table) =>
      eq((table as unknown as { organizationId: { name: string } }).organizationId as never, organizationId as never),
  };
}

export async function requireOrgContext(): Promise<ScopedActionContext> {
  return getActionContext();
}
