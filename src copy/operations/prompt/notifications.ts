import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notifications } from "@/db/schema/notification";
import { getActionContext } from "@/lib/auth/context";

export async function listNotificationsForCurrentUser(opts: { limit?: number; unreadOnly?: boolean } = {}) {
  const ctx = await getActionContext();
  const conditions = [
    eq(notifications.organizationId, ctx.organizationId),
    eq(notifications.recipientId, ctx.userId),
  ];
  if (opts.unreadOnly) conditions.push(eq(notifications.read, false));
  return db.query.notifications.findMany({
    where: and(...conditions),
    orderBy: [desc(notifications.createdAt)],
    limit: opts.limit ?? 100,
  });
}

export async function markNotificationRead(id: string): Promise<void> {
  const ctx = await getActionContext();
  await db
    .update(notifications)
    .set({ read: true, readAt: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.organizationId, ctx.organizationId),
        eq(notifications.recipientId, ctx.userId),
      ),
    );
}

export async function markAllNotificationsRead(): Promise<void> {
  const ctx = await getActionContext();
  await db
    .update(notifications)
    .set({ read: true, readAt: new Date() })
    .where(
      and(
        eq(notifications.organizationId, ctx.organizationId),
        eq(notifications.recipientId, ctx.userId),
        eq(notifications.read, false),
      ),
    );
}
