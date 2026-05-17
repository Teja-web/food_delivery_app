"use server";

import { markAllNotificationsRead, markNotificationRead } from "@/operations/notifications";
import { safeRevalidate } from "@/lib/safe-revalidate";

export async function markRead(id: string) {
  await markNotificationRead(id);
  safeRevalidate("/notifications");
}

export async function markAllRead() {
  await markAllNotificationsRead();
  safeRevalidate("/notifications");
}
