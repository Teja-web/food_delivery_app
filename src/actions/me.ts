"use server";

import { getActionContext } from "@/lib/auth/context";
import { getMeDashboard } from "@/operations/personal";

/**
 * Personal dashboard payload for the `/me` route. Composes everything in
 * one server action so the page does one round trip.
 */
export async function getMeDashboardAction() {
  const ctx = await getActionContext();
  return getMeDashboard(ctx.organizationId, ctx.user.id);
}
