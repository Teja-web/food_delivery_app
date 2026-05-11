import { google } from "googleapis";
import { db } from "@/db/client";
import { oauthConnections } from "@/db/schema/integrations";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "./encryption";
import { nanoid } from "nanoid";
import { getProviderCredentials } from "./credentials";
import {
  registerCalendarProvider,
  type CalendarProviderImpl,
  type CalendarEvent,
  type CalendarEventResult,
  type BusySlot,
} from "./calendar";

const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

async function getOAuth2Client(orgId: string) {
  const creds = await getProviderCredentials(orgId, "google-calendar");
  if (creds.type !== "oauth") throw new Error("Google Calendar requires OAuth credentials");
  return new google.auth.OAuth2(creds.clientId, creds.clientSecret, creds.redirectUri);
}

async function getAuthenticatedClient(connectionId: string) {
  const [connection] = await db
    .select()
    .from(oauthConnections)
    .where(eq(oauthConnections.id, connectionId))
    .limit(1);

  if (!connection) return null;

  const client = await getOAuth2Client(connection.organizationId);
  client.setCredentials({
    access_token: decrypt(connection.accessTokenEncrypted),
    refresh_token: connection.refreshTokenEncrypted ? decrypt(connection.refreshTokenEncrypted) : undefined,
    expiry_date: connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt).getTime() : undefined,
  });

  // Auto-refresh if expired
  if (connection.tokenExpiresAt && new Date(connection.tokenExpiresAt).getTime() < Date.now()) {
    let credentials;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await client.refreshAccessToken();
        credentials = result.credentials;
        break;
      } catch (error) {
        if (attempt === 1) {
          console.error("[google-calendar] Token refresh failed after retry", { connectionId, error });
          await db
            .update(oauthConnections)
            .set({ status: "needs_reauth", updatedAt: new Date().toISOString() })
            .where(eq(oauthConnections.id, connectionId));
          return null;
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    await db
      .update(oauthConnections)
      .set({
        accessTokenEncrypted: encrypt(credentials!.access_token!),
        tokenExpiresAt: credentials!.expiry_date ? new Date(credentials!.expiry_date).toISOString() : null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(oauthConnections.id, connectionId));
    client.setCredentials(credentials!);
  }

  return { client, connection };
}

// Helper to get connection by userId for freebusy
async function getConnectionByUserId(userId: string) {
  const [connection] = await db
    .select()
    .from(oauthConnections)
    .where(
      and(
        eq(oauthConnections.userId, userId),
        eq(oauthConnections.provider, "google-calendar"),
        eq(oauthConnections.status, "active")
      )
    )
    .limit(1);

  if (!connection) return null;
  return getAuthenticatedClient(connection.id);
}

// -- Provider implementation -----------------------------------------

const googleCalendarProvider: CalendarProviderImpl = {
  provider: "google-calendar",

  async getAuthUrl(userId: string, orgId: string): Promise<string> {
    const client = await getOAuth2Client(orgId);
    return client.generateAuthUrl({
      access_type: "offline",
      scope: CALENDAR_SCOPES,
      prompt: "consent",
      state: encrypt(JSON.stringify({ userId, orgId, provider: "google-calendar" })),
    });
  },

  async exchangeCodeForTokens(code: string, userId: string, orgId: string): Promise<string> {
    const client = await getOAuth2Client(orgId);
    const { tokens: oauthTokens } = await client.getToken(code);

    if (!oauthTokens.access_token || !oauthTokens.refresh_token) {
      throw new Error("Failed to get tokens from Google");
    }

    // Get user's email
    client.setCredentials(oauthTokens);
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data } = await oauth2.userinfo.get();

    const now = new Date().toISOString();

    // Check for existing connection
    const [existing] = await db
      .select()
      .from(oauthConnections)
      .where(
        and(
          eq(oauthConnections.userId, userId),
          eq(oauthConnections.organizationId, orgId),
          eq(oauthConnections.provider, "google-calendar")
        )
      )
      .limit(1);

    if (existing) {
      // Update existing connection
      await db
        .update(oauthConnections)
        .set({
          status: "active",
          accountEmail: data.email ?? null,
          accountName: data.name ?? data.email ?? null,
          scopes: CALENDAR_SCOPES,
          accessTokenEncrypted: encrypt(oauthTokens.access_token),
          refreshTokenEncrypted: encrypt(oauthTokens.refresh_token),
          tokenExpiresAt: oauthTokens.expiry_date ? new Date(oauthTokens.expiry_date).toISOString() : null,
          connectedAt: now,
          updatedAt: now,
        })
        .where(eq(oauthConnections.id, existing.id));

      return data.email ?? "";
    }

    // Create new connection
    await db.insert(oauthConnections).values({
      id: nanoid(),
      organizationId: orgId,
      userId,
      provider: "google-calendar",
      category: "calendar",
      status: "active",
      accountEmail: data.email ?? null,
      accountName: data.name ?? data.email ?? null,
      scopes: CALENDAR_SCOPES,
      accessTokenEncrypted: encrypt(oauthTokens.access_token),
      refreshTokenEncrypted: encrypt(oauthTokens.refresh_token),
      tokenType: oauthTokens.token_type || "Bearer",
      tokenExpiresAt: oauthTokens.expiry_date ? new Date(oauthTokens.expiry_date).toISOString() : null,
      connectedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return data.email ?? "";
  },

  async getFreeBusy(userIds: string[], timeMin: string, timeMax: string): Promise<Record<string, BusySlot[]>> {
    const result: Record<string, BusySlot[]> = {};

    for (const userId of userIds) {
      try {
        const auth = await getConnectionByUserId(userId);
        if (!auth) {
          console.warn(`[Google Calendar] No active connection for user ${userId}`);
          continue;
        }

        const calendar = google.calendar({ version: "v3", auth: auth.client });
        const res = await calendar.freebusy.query({
          requestBody: {
            timeMin,
            timeMax,
            items: [{ id: "primary" }],
          },
        });

        // The API returns calendars keyed by actual calendar ID (email), not "primary"
        // Merge busy slots from all calendars in the response
        const calendars = res.data.calendars ?? {};

        const busy: { start?: string | null; end?: string | null }[] = [];
        for (const calendarData of Object.values(calendars)) {
          if (calendarData?.busy) {
            busy.push(...calendarData.busy);
          }
        }
        result[userId] = busy.map((b) => ({
          start: b.start ?? "",
          end: b.end ?? "",
        }));
      } catch (error) {
        console.error(`[Google Calendar] Failed to fetch freebusy for user ${userId}:`, error);
        // Continue with other users instead of failing the entire request
        result[userId] = [];
      }
    }

    return result;
  },

  async createEvent(connectionId: string, event: CalendarEvent): Promise<CalendarEventResult | null> {
    const auth = await getAuthenticatedClient(connectionId);
    if (!auth) return null;

    const calendar = google.calendar({ version: "v3", auth: auth.client });

    const res = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: event.createMeetLink ? 1 : 0,
      sendUpdates: "all", // Send email invites to attendees
      requestBody: {
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.startTime },
        end: { dateTime: event.endTime },
        attendees: event.attendeeEmails.map((email) => ({ email })),
        ...(event.createMeetLink && {
          conferenceData: {
            createRequest: {
              requestId: `interview-${Date.now()}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }),
      },
    });

    // Update last used
    await db
      .update(oauthConnections)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(oauthConnections.id, connectionId));

    return {
      eventId: res.data.id ?? "",
      meetLink: res.data.hangoutLink ?? undefined,
    };
  },

  async updateEvent(connectionId: string, eventId: string, event: CalendarEvent): Promise<CalendarEventResult | null> {
    const auth = await getAuthenticatedClient(connectionId);
    if (!auth) return null;

    const calendar = google.calendar({ version: "v3", auth: auth.client });

    const res = await calendar.events.update({
      calendarId: "primary",
      eventId,
      conferenceDataVersion: event.createMeetLink ? 1 : 0,
      sendUpdates: "all", // Notify attendees of changes
      requestBody: {
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.startTime },
        end: { dateTime: event.endTime },
        attendees: event.attendeeEmails.map((email) => ({ email })),
      },
    });

    // Update last used
    await db
      .update(oauthConnections)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(oauthConnections.id, connectionId));

    return {
      eventId: res.data.id ?? "",
      meetLink: res.data.hangoutLink ?? undefined,
    };
  },

  async deleteEvent(connectionId: string, eventId: string): Promise<boolean> {
    const auth = await getAuthenticatedClient(connectionId);
    if (!auth) return false;

    const calendar = google.calendar({ version: "v3", auth: auth.client });
    try {
      await calendar.events.delete({ calendarId: "primary", eventId, sendUpdates: "all" });
      return true;
    } catch {
      return false;
    }
  },
};

registerCalendarProvider(googleCalendarProvider);

// googleCalendarProvider is registered above via registerCalendarProvider()
