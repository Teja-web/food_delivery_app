import { listNotificationsForCurrentUser } from "@/operations/notifications";

import { NotificationsClient } from "./NotificationsClient";
import { serializeNotification } from "./serialize";

export default async function NotificationsPage() {
  const rows = await listNotificationsForCurrentUser({ limit: 200 });
  return <NotificationsClient items={rows.map(serializeNotification)} />;
}
