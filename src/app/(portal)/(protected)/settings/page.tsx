import { requirePortalCandidateSession } from "@/lib/auth/portal";
import { fetchPortalProfile } from "@/actions/portal";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const [session, profile] = await Promise.all([
    requirePortalCandidateSession(),
    fetchPortalProfile(),
  ]);

  const notifications = {} as Record<string, boolean>;

  return (
    <SettingsClient
      email={session.email}
      name={session.name ?? null}
      notifications={notifications}
    />
  );
}
