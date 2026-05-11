"use server";

import { getActionContext } from "@/lib/auth/context";
import { disconnectCalendar } from "@/lib/integrations/calendar";
import { disconnectEmail } from "@/lib/integrations/email";
import { disconnectATS } from "@/lib/integrations/ats";
import { disconnectHRIS } from "@/lib/integrations/hris";
import {
  saveOrgCredentials,
  removeOrgCredentials,
  getOrgCredentialStatuses,
} from "@/lib/integrations/credentials";
import { revalidatePath } from "next/cache";
import "@/lib/integrations/register-providers";

// -- Disconnect actions ---------------------------------------------------

export async function disconnectCalendarAction() {
  const ctx = await getActionContext();
  await disconnectCalendar(ctx.userId);
  revalidatePath("/recruit/settings/integrations");
}

export async function disconnectEmailAction() {
  const ctx = await getActionContext();
  await disconnectEmail(ctx.userId);
  revalidatePath("/recruit/settings/integrations");
}

export async function disconnectATSAction() {
  const ctx = await getActionContext();
  await disconnectATS(ctx.organizationId);
  revalidatePath("/recruit/settings/integrations");
}

export async function disconnectHRISAction() {
  const ctx = await getActionContext();
  await disconnectHRIS(ctx.organizationId);
  revalidatePath("/recruit/settings/integrations");
}

// -- Credential management actions ----------------------------------------

/**
 * Save integration credentials for a provider (API key or OAuth app creds).
 * For API key providers: data = { apiKey, config? }
 * For OAuth providers: data = { clientId, clientSecret, config? }
 */
export async function saveIntegrationCredentialsAction(
  provider: string,
  category: "ats" | "hris" | "calendar" | "email",
  data: {
    clientId?: string;
    clientSecret?: string;
    apiKey?: string;
    config?: Record<string, string>;
  },
) {
  const ctx = await getActionContext();
  await saveOrgCredentials(ctx.organizationId, provider, category, data, ctx.userId);
  revalidatePath("/recruit/settings/integrations");
}

/**
 * Remove integration credentials for a provider.
 * Also disconnects any active connection.
 */
export async function removeIntegrationCredentialsAction(
  provider: string,
  category: "ats" | "hris" | "calendar" | "email",
) {
  const ctx = await getActionContext();
  await removeOrgCredentials(ctx.organizationId, provider);

  // Also disconnect if there's an active OAuth connection
  if (category === "ats") {
    await disconnectATS(ctx.organizationId);
  } else if (category === "hris") {
    await disconnectHRIS(ctx.organizationId);
  }

  revalidatePath("/recruit/settings/integrations");
}

/**
 * Get credential statuses for all providers (used by settings page).
 */
export async function getCredentialStatusesAction() {
  const ctx = await getActionContext();
  const allProviders = [
    "google-calendar", "outlook-calendar",
    "google-email", "outlook-email",
    "greenhouse", "lever", "ashby", "workable",
    "bamboohr", "workday", "gusto",
  ];
  return getOrgCredentialStatuses(ctx.organizationId, allProviders);
}
