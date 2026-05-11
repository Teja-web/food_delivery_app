import { getActionContext } from "@/lib/auth/context";
import { getUserCalendarConnection } from "@/lib/integrations/calendar";
import { getUserEmailConnection } from "@/lib/integrations/email";
import { getOrgATSConnection } from "@/lib/integrations/ats";
import { getOrgHRISConnection } from "@/lib/integrations/hris";
import { getOrgCredentialStatuses } from "@/lib/integrations/credentials";
import { IntegrationsClient } from "./IntegrationsClient";

const ALL_PROVIDERS = [
  "google-calendar", "outlook-calendar",
  "google-email", "outlook-email",
  "greenhouse", "lever", "ashby", "workable",
  "bamboohr", "workday", "gusto",
];

export default async function IntegrationsPage() {
  const ctx = await getActionContext();
  const [calendarConnection, emailConnection, atsConnection, hrisConnection, credentialStatuses] = await Promise.all([
    getUserCalendarConnection(ctx.userId),
    getUserEmailConnection(ctx.userId),
    getOrgATSConnection(ctx.organizationId),
    getOrgHRISConnection(ctx.organizationId),
    getOrgCredentialStatuses(ctx.organizationId, ALL_PROVIDERS),
  ]);

  return (
    <IntegrationsClient
      calendarConnection={calendarConnection}
      emailConnection={emailConnection}
      atsConnection={atsConnection}
      hrisConnection={hrisConnection}
      credentialStatuses={credentialStatuses}
    />
  );
}
