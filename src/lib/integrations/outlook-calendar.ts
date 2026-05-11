import { db } from "@/db/client";
import { oauthConnections } from "@/db/schema/integrations";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "./encryption";
import { nanoid } from "nanoid";
import { getProviderCredentials, type OAuthCredentials } from "./credentials";
import {
  registerCalendarProvider,
  type CalendarProviderImpl,
  type CalendarEvent,
  type CalendarEventResult,
  type BusySlot,
} from "./calendar";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0";

const OUTLOOK_SCOPES = [
  "openid",
  "email",
  "offline_access",
  "Calendars.ReadWrite",
];

async function getMicrosoftCreds(orgId: string): Promise<OAuthCredentials> {
  const creds = await getProviderCredentials(orgId, "outlook-calendar");
  if (creds.type !== "oauth") throw new Error("Outlook Calendar requires OAuth credentials");
  return creds;
}

async function refreshAccessToken(connectionId: string, orgId: string, refreshToken: string): Promise<string> {
  const creds = await getMicrosoftCreds(orgId);

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${AUTH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: OUTLOOK_SCOPES.join(" "),
      }),
    });

    if (res.ok) {
      const newTokens = await res.json();
      const now = new Date().toISOString();

      await db.update(oauthConnections).set({
        accessTokenEncrypted: encrypt(newTokens.access_token),
        ...(newTokens.refresh_token && { refreshTokenEncrypted: encrypt(newTokens.refresh_token) }),
        tokenExpiresAt: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
        updatedAt: now,
      }).where(eq(oauthConnections.id, connectionId));

      return newTokens.access_token;
    }

    if (attempt === 1) {
      console.error("[outlook-calendar] Token refresh failed after retry", { connectionId, status: res.status });
      await db.update(oauthConnections).set({
        status: "needs_reauth",
        updatedAt: new Date().toISOString(),
      }).where(eq(oauthConnections.id, connectionId));
      throw new Error(`Microsoft token refresh failed: ${res.status}`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  throw new Error("Unreachable");
}

async function getAccessToken(connectionId: string): Promise<string | null> {
  const [connection] = await db
    .select()
    .from(oauthConnections)
    .where(eq(oauthConnections.id, connectionId))
    .limit(1);

  if (!connection) return null;

  let token = decrypt(connection.accessTokenEncrypted);

  // Auto-refresh if expired
  if (connection.tokenExpiresAt && new Date(connection.tokenExpiresAt).getTime() < Date.now()) {
    if (!connection.refreshTokenEncrypted) return null;
    token = await refreshAccessToken(connectionId, connection.organizationId, decrypt(connection.refreshTokenEncrypted));
  }

  return token;
}

// Helper to get connection by userId
async function getConnectionByUserId(userId: string) {
  const [connection] = await db
    .select()
    .from(oauthConnections)
    .where(
      and(
        eq(oauthConnections.userId, userId),
        eq(oauthConnections.provider, "outlook-calendar"),
        eq(oauthConnections.status, "active")
      )
    )
    .limit(1);

  return connection ?? null;
}

async function graphFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph API ${path} failed (${res.status}): ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// -- Provider implementation -----------------------------------------

const outlookCalendarProvider: CalendarProviderImpl = {
  provider: "outlook-calendar",

  async getAuthUrl(userId: string, orgId: string): Promise<string> {
    const creds = await getMicrosoftCreds(orgId);
    const params = new URLSearchParams({
      client_id: creds.clientId,
      response_type: "code",
      redirect_uri: creds.redirectUri,
      scope: OUTLOOK_SCOPES.join(" "),
      response_mode: "query",
      prompt: "consent",
      state: encrypt(JSON.stringify({ userId, orgId, provider: "outlook-calendar" })),
    });
    return `${AUTH_BASE}/authorize?${params.toString()}`;
  },

  async exchangeCodeForTokens(code: string, userId: string, orgId: string): Promise<string> {
    const creds = await getMicrosoftCreds(orgId);
    const res = await fetch(`${AUTH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: creds.redirectUri,
        scope: OUTLOOK_SCOPES.join(" "),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Microsoft token exchange failed (${res.status}): ${body}`);
    }

    const oauthTokens = await res.json();

    if (!oauthTokens.access_token || !oauthTokens.refresh_token) {
      throw new Error("Failed to get tokens from Microsoft");
    }

    // Get user's email from Graph
    const profile = await graphFetch(oauthTokens.access_token, "/me?$select=mail,userPrincipalName,displayName");
    const email = profile.mail || profile.userPrincipalName;
    const now = new Date().toISOString();

    // Check for existing connection
    const [existing] = await db
      .select()
      .from(oauthConnections)
      .where(
        and(
          eq(oauthConnections.userId, userId),
          eq(oauthConnections.organizationId, orgId),
          eq(oauthConnections.provider, "outlook-calendar")
        )
      )
      .limit(1);

    if (existing) {
      // Update existing connection
      await db
        .update(oauthConnections)
        .set({
          status: "active",
          accountEmail: email ?? null,
          accountName: profile.displayName ?? email ?? null,
          scopes: OUTLOOK_SCOPES,
          accessTokenEncrypted: encrypt(oauthTokens.access_token),
          refreshTokenEncrypted: encrypt(oauthTokens.refresh_token),
          tokenExpiresAt: new Date(Date.now() + oauthTokens.expires_in * 1000).toISOString(),
          connectedAt: now,
          updatedAt: now,
        })
        .where(eq(oauthConnections.id, existing.id));

      return email ?? "";
    }

    // Create new connection
    await db.insert(oauthConnections).values({
      id: nanoid(),
      organizationId: orgId,
      userId,
      provider: "outlook-calendar",
      category: "calendar",
      status: "active",
      accountEmail: email ?? null,
      accountName: profile.displayName ?? email ?? null,
      scopes: OUTLOOK_SCOPES,
      accessTokenEncrypted: encrypt(oauthTokens.access_token),
      refreshTokenEncrypted: encrypt(oauthTokens.refresh_token),
      tokenType: "Bearer",
      tokenExpiresAt: new Date(Date.now() + oauthTokens.expires_in * 1000).toISOString(),
      connectedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return email ?? "";
  },

  async getFreeBusy(userIds: string[], timeMin: string, timeMax: string): Promise<Record<string, BusySlot[]>> {
    const result: Record<string, BusySlot[]> = {};

    for (const userId of userIds) {
      const connection = await getConnectionByUserId(userId);
      if (!connection) continue;

      const token = await getAccessToken(connection.id);
      if (!token) continue;

      const data = await graphFetch(token, "/me/calendar/getSchedule", {
        method: "POST",
        body: JSON.stringify({
          schedules: ["me"],
          startTime: { dateTime: timeMin, timeZone: "UTC" },
          endTime: { dateTime: timeMax, timeZone: "UTC" },
        }),
      });

      const schedule = data?.value?.[0];
      const items = schedule?.scheduleItems ?? [];
      result[userId] = items.map((item: any) => ({
        start: item.start?.dateTime ?? "",
        end: item.end?.dateTime ?? "",
      }));
    }

    return result;
  },

  async createEvent(connectionId: string, event: CalendarEvent): Promise<CalendarEventResult | null> {
    const token = await getAccessToken(connectionId);
    if (!token) return null;

    const body: any = {
      subject: event.summary,
      body: event.description ? { contentType: "text", content: event.description } : undefined,
      start: { dateTime: event.startTime, timeZone: "UTC" },
      end: { dateTime: event.endTime, timeZone: "UTC" },
      attendees: event.attendeeEmails.map((email) => ({
        emailAddress: { address: email },
        type: "required",
      })),
    };

    if (event.createMeetLink) {
      body.isOnlineMeeting = true;
      body.onlineMeetingProvider = "teamsForBusiness";
    }

    const data = await graphFetch(token, "/me/events", {
      method: "POST",
      body: JSON.stringify(body),
    });

    // Update last used
    await db
      .update(oauthConnections)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(oauthConnections.id, connectionId));

    return {
      eventId: data.id ?? "",
      meetLink: data.onlineMeeting?.joinUrl ?? undefined,
    };
  },

  async updateEvent(connectionId: string, eventId: string, event: CalendarEvent): Promise<CalendarEventResult | null> {
    const token = await getAccessToken(connectionId);
    if (!token) return null;

    const body: any = {
      subject: event.summary,
      body: event.description ? { contentType: "text", content: event.description } : undefined,
      start: { dateTime: event.startTime, timeZone: "UTC" },
      end: { dateTime: event.endTime, timeZone: "UTC" },
      attendees: event.attendeeEmails.map((email) => ({
        emailAddress: { address: email },
        type: "required",
      })),
    };

    const data = await graphFetch(token, `/me/events/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    // Update last used
    await db
      .update(oauthConnections)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(oauthConnections.id, connectionId));

    return {
      eventId: data.id ?? "",
      meetLink: data.onlineMeeting?.joinUrl ?? undefined,
    };
  },

  async deleteEvent(connectionId: string, eventId: string): Promise<boolean> {
    const token = await getAccessToken(connectionId);
    if (!token) return false;

    try {
      await graphFetch(token, `/me/events/${eventId}`, { method: "DELETE" });
      return true;
    } catch {
      return false;
    }
  },
};

registerCalendarProvider(outlookCalendarProvider);

// outlookCalendarProvider is registered above via registerCalendarProvider()
