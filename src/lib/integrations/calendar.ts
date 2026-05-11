/**
 * Shared calendar provider interface.
 *
 * Both Google and Outlook implementations conform to this contract.
 * Route handlers and actions import from here — never from a specific provider.
 */

import { db } from "@/db/client";
import { oauthConnections } from "@/db/schema/integrations";
import { eq, and, inArray } from "drizzle-orm";

// -- Types -----------------------------------------------------------

export type CalendarProvider = "google-calendar" | "outlook-calendar";

export interface CalendarEvent {
  summary: string;
  description?: string;
  startTime: string;
  endTime: string;
  attendeeEmails: string[];
  createMeetLink?: boolean;
}

export interface CalendarEventResult {
  eventId: string;
  meetLink?: string;
}

export interface BusySlot {
  start: string;
  end: string;
}

export interface CalendarProviderImpl {
  provider: CalendarProvider;
  getAuthUrl(userId: string, orgId: string): string | Promise<string>;
  exchangeCodeForTokens(code: string, userId: string, orgId: string): Promise<string>;
  getFreeBusy(userIds: string[], timeMin: string, timeMax: string): Promise<Record<string, BusySlot[]>>;
  createEvent(connectionId: string, event: CalendarEvent): Promise<CalendarEventResult | null>;
  updateEvent(connectionId: string, eventId: string, event: CalendarEvent): Promise<CalendarEventResult | null>;
  deleteEvent(connectionId: string, eventId: string): Promise<boolean>;
}

// -- Provider registry -----------------------------------------------

const providers = new Map<CalendarProvider, CalendarProviderImpl>();

export function registerCalendarProvider(impl: CalendarProviderImpl) {
  providers.set(impl.provider, impl);
}

export function getCalendarProvider(provider: CalendarProvider): CalendarProviderImpl {
  const impl = providers.get(provider);
  if (!impl) throw new Error(`Calendar provider "${provider}" is not registered`);
  return impl;
}

// -- Provider-agnostic helpers (used by routes & actions) ------------

export async function getUserCalendarConnection(userId: string) {
  const [connection] = await db
    .select({
      id: oauthConnections.id,
      calendarEmail: oauthConnections.accountEmail,
      provider: oauthConnections.provider,
    })
    .from(oauthConnections)
    .where(
      and(
        eq(oauthConnections.userId, userId),
        eq(oauthConnections.category, "calendar"),
        eq(oauthConnections.status, "active")
      )
    )
    .limit(1);
  return connection ?? null;
}

export async function disconnectCalendar(userId: string) {
  await db
    .delete(oauthConnections)
    .where(
      and(
        eq(oauthConnections.userId, userId),
        eq(oauthConnections.category, "calendar")
      )
    );
}

/**
 * Get free/busy across all connected users, auto-resolving each user's provider.
 */
export async function getFreeBusy(
  userIds: string[],
  timeMin: string,
  timeMax: string,
): Promise<Record<string, BusySlot[]>> {
  // Group users by provider
  const relevantConnections = await db
    .select({
      id: oauthConnections.id,
      userId: oauthConnections.userId,
      provider: oauthConnections.provider
    })
    .from(oauthConnections)
    .where(
      and(
        inArray(oauthConnections.userId, userIds),
        eq(oauthConnections.category, "calendar"),
        eq(oauthConnections.status, "active")
      )
    );

  const byProvider = new Map<CalendarProvider, string[]>();
  for (const conn of relevantConnections) {
    const provider = conn.provider as CalendarProvider;
    const list = byProvider.get(provider) ?? [];
    list.push(conn.userId);
    byProvider.set(provider, list);
  }

  const result: Record<string, BusySlot[]> = {};
  for (const [provider, providerUserIds] of byProvider) {
    const impl = providers.get(provider);
    if (!impl) continue;
    const providerResult = await impl.getFreeBusy(providerUserIds, timeMin, timeMax);
    Object.assign(result, providerResult);
  }

  return result;
}

/**
 * Create a calendar event using whichever provider the user has connected.
 */
export async function createCalendarEvent(
  userId: string,
  event: CalendarEvent,
): Promise<CalendarEventResult | null> {
  const conn = await getUserCalendarConnection(userId);
  if (!conn) return null;
  const impl = providers.get(conn.provider as CalendarProvider);
  if (!impl) return null;
  try {
    return await impl.createEvent(conn.id, event);
  } catch (error) {
    console.error(`[Calendar] Failed to create event for user ${userId}:`, error);
    return null;
  }
}

/**
 * Update a calendar event using whichever provider the user has connected.
 */
export async function updateCalendarEvent(
  userId: string,
  eventId: string,
  event: CalendarEvent,
): Promise<CalendarEventResult | null> {
  const conn = await getUserCalendarConnection(userId);
  if (!conn) return null;
  const impl = providers.get(conn.provider as CalendarProvider);
  if (!impl) return null;
  try {
    return await impl.updateEvent(conn.id, eventId, event);
  } catch (error) {
    console.error(`[Calendar] Failed to update event ${eventId} for user ${userId}:`, error);
    return null;
  }
}

/**
 * Delete a calendar event using whichever provider the user has connected.
 */
export async function deleteCalendarEvent(
  userId: string,
  eventId: string,
): Promise<boolean> {
  const conn = await getUserCalendarConnection(userId);
  if (!conn) return false;
  const impl = providers.get(conn.provider as CalendarProvider);
  if (!impl) return false;
  try {
    return await impl.deleteEvent(conn.id, eventId);
  } catch (error) {
    console.error(`[Calendar] Failed to delete event ${eventId} for user ${userId}:`, error);
    return false;
  }
}
