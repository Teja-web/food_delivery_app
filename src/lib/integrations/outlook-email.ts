/**
 * Outlook Email provider implementation (Microsoft Graph).
 *
 * Reuses the same Microsoft OAuth + Graph API pattern as outlook-calendar.ts.
 * Uses Mail.Send scope to send emails via the Graph sendMail endpoint.
 *
 * Ref: https://learn.microsoft.com/en-us/graph/api/user-sendmail
 */

import { db } from "@/db/client";
import { oauthConnections } from "@/db/schema/integrations";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "./encryption";
import { nanoid } from "nanoid";
import { getProviderCredentials, type OAuthCredentials } from "./credentials";
import {
  registerEmailProvider,
  type EmailProviderImpl,
  type SendEmailOptions,
} from "./email";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0";

const OUTLOOK_EMAIL_SCOPES = [
  "openid",
  "email",
  "offline_access",
  "Mail.Send",
];

async function getMicrosoftCreds(orgId: string): Promise<OAuthCredentials> {
  const creds = await getProviderCredentials(orgId, "outlook-email");
  if (creds.type !== "oauth") throw new Error("Outlook Email requires OAuth credentials");
  return creds;
}

async function refreshAccessToken(connectionId: string, orgId: string, refreshToken: string): Promise<string> {
  const creds = await getMicrosoftCreds(orgId);
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: OUTLOOK_EMAIL_SCOPES.join(" "),
    }),
  });

  if (!res.ok) throw new Error(`Microsoft token refresh failed: ${res.status}`);
  const newTokens = await res.json();

  await db.update(oauthConnections).set({
    accessTokenEncrypted: encrypt(newTokens.access_token),
    ...(newTokens.refresh_token && { refreshTokenEncrypted: encrypt(newTokens.refresh_token) }),
    tokenExpiresAt: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  }).where(eq(oauthConnections.id, connectionId));

  return newTokens.access_token;
}

async function getAccessToken(connectionId: string): Promise<string | null> {
  const [connection] = await db
    .select()
    .from(oauthConnections)
    .where(eq(oauthConnections.id, connectionId))
    .limit(1);

  if (!connection) return null;

  let token = decrypt(connection.accessTokenEncrypted);

  if (connection.tokenExpiresAt && new Date(connection.tokenExpiresAt).getTime() < Date.now()) {
    if (!connection.refreshTokenEncrypted) return null;
    token = await refreshAccessToken(connectionId, connection.organizationId, decrypt(connection.refreshTokenEncrypted));
  }

  return token;
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

// -- Provider implementation ------------------------------------------

const outlookEmailProvider: EmailProviderImpl = {
  provider: "outlook-email",

  async getAuthUrl(userId: string, orgId: string): Promise<string> {
    const creds = await getMicrosoftCreds(orgId);
    const params = new URLSearchParams({
      client_id: creds.clientId,
      response_type: "code",
      redirect_uri: creds.redirectUri,
      scope: OUTLOOK_EMAIL_SCOPES.join(" "),
      response_mode: "query",
      prompt: "consent",
      state: encrypt(JSON.stringify({ userId, orgId, provider: "outlook-email" })),
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
        scope: OUTLOOK_EMAIL_SCOPES.join(" "),
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
          eq(oauthConnections.provider, "outlook-email")
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(oauthConnections)
        .set({
          status: "active",
          accountEmail: email ?? null,
          accountName: profile.displayName ?? email ?? null,
          scopes: OUTLOOK_EMAIL_SCOPES,
          accessTokenEncrypted: encrypt(oauthTokens.access_token),
          refreshTokenEncrypted: encrypt(oauthTokens.refresh_token),
          tokenExpiresAt: new Date(Date.now() + oauthTokens.expires_in * 1000).toISOString(),
          connectedAt: now,
          updatedAt: now,
        })
        .where(eq(oauthConnections.id, existing.id));

      return email ?? "";
    }

    await db.insert(oauthConnections).values({
      id: nanoid(),
      organizationId: orgId,
      userId,
      provider: "outlook-email",
      category: "email",
      status: "active",
      accountEmail: email ?? null,
      accountName: profile.displayName ?? email ?? null,
      scopes: OUTLOOK_EMAIL_SCOPES,
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

  async sendEmail(connectionId: string, options: SendEmailOptions) {
    const token = await getAccessToken(connectionId);
    if (!token) throw new Error("No email connection found");

    const toRecipients = Array.isArray(options.to) ? options.to : [options.to];

    await graphFetch(token, "/me/sendMail", {
      method: "POST",
      body: JSON.stringify({
        message: {
          subject: options.subject,
          body: {
            contentType: "HTML",
            content: options.html,
          },
          toRecipients: toRecipients.map((email) => ({
            emailAddress: { address: email },
          })),
        },
        saveToSentItems: true,
      }),
    });

    await db
      .update(oauthConnections)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(oauthConnections.id, connectionId));
  },
};

registerEmailProvider(outlookEmailProvider);
