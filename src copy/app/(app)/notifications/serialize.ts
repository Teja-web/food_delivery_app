import type { Notification, NotificationChannel } from "@/db/schema/notification";

export interface NotificationClient {
  id: string;
  channel: NotificationChannel;
  subject: string | null;
  body: string;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  read: boolean;
  createdAt: string;
}

export function serializeNotification(n: Notification): NotificationClient {
  return {
    id: n.id,
    channel: n.channel,
    subject: n.subject,
    body: n.body,
    link: n.link,
    entityType: n.entityType,
    entityId: n.entityId,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  };
}
