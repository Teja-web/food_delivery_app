import { google } from "googleapis";
import { db } from "@/db/client";
import { oauthConnections } from "@/db/schema/integrations";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "./encryption";
import { nanoid } from "nanoid";
import { getProviderCredentials } from "./credentials";
import {
  registerEmailProvider,
  type EmailProviderImpl,
  type SendEmailOptions,
} from "./email";

const EMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

async function getOAuth2Client(orgId: string) {
  const creds = await getProviderCredentials(orgId, "google-email");
  if (creds.type !== "oauth") throw new Error("Google Email requires OAuth credentials");
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
    try {
      const { credentials } = await client.refreshAccessToken();
      await db
        .update(oauthConnections)
        .set({
          accessTokenEncrypted: encrypt(credentials.access_token!),
          tokenExpiresAt: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(oauthConnections.id, connectionId));
      client.setCredentials(credentials);
    } catch (error) {
      console.error("[google-email] Token refresh failed", { connectionId, error });
      await db
        .update(oauthConnections)
        .set({ status: "needs_reauth", updatedAt: new Date().toISOString() })
        .where(eq(oauthConnections.id, connectionId));
      return null;
    }
  }

  return client;
}

function createEmailMessage(options: SendEmailOptions): string {
  const to = Array.isArray(options.to) ? options.to.join(", ") : options.to;
  const from = options.from || "";
  const messageParts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${options.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    options.html,
  ];
  return messageParts.join("\n");
}

const googleEmailProvider: EmailProviderImpl = {
  provider: "google-email",

  async getAuthUrl(userId: string, orgId: string) {
    const client = await getOAuth2Client(orgId);
    return client.generateAuthUrl({
      access_type: "offline",
      scope: EMAIL_SCOPES,
      prompt: "consent",
      state: encrypt(JSON.stringify({ userId, orgId, provider: "google-email" })),
    });
  },

  async exchangeCodeForTokens(code: string, userId: string, orgId: string) {
    const client = await getOAuth2Client(orgId);
    const { tokens: oauthTokens } = await client.getToken(code);
    client.setCredentials(oauthTokens);

    // Get user email
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data } = await oauth2.userinfo.get();
    const email = data.email || "";
    const now = new Date().toISOString();

    // Check for existing connection
    const [existing] = await db
      .select()
      .from(oauthConnections)
      .where(
        and(
          eq(oauthConnections.userId, userId),
          eq(oauthConnections.organizationId, orgId),
          eq(oauthConnections.provider, "google-email")
        )
      )
      .limit(1);

    if (existing) {
      // Update existing connection
      await db
        .update(oauthConnections)
        .set({
          status: "active",
          accountEmail: email,
          accountName: data.name || email,
          scopes: EMAIL_SCOPES,
          accessTokenEncrypted: encrypt(oauthTokens.access_token!),
          refreshTokenEncrypted: oauthTokens.refresh_token ? encrypt(oauthTokens.refresh_token) : null,
          tokenExpiresAt: oauthTokens.expiry_date ? new Date(oauthTokens.expiry_date).toISOString() : null,
          connectedAt: now,
          updatedAt: now,
        })
        .where(eq(oauthConnections.id, existing.id));

      return email;
    }

    // Create new connection
    await db.insert(oauthConnections).values({
      id: nanoid(),
      organizationId: orgId,
      userId,
      provider: "google-email",
      category: "email",
      status: "active",
      accountEmail: email,
      accountName: data.name || email,
      scopes: EMAIL_SCOPES,
      accessTokenEncrypted: encrypt(oauthTokens.access_token!),
      refreshTokenEncrypted: oauthTokens.refresh_token ? encrypt(oauthTokens.refresh_token) : null,
      tokenType: oauthTokens.token_type || "Bearer",
      tokenExpiresAt: oauthTokens.expiry_date ? new Date(oauthTokens.expiry_date).toISOString() : null,
      connectedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return email;
  },

  async sendEmail(connectionId: string, options: SendEmailOptions) {
    const client = await getAuthenticatedClient(connectionId);
    if (!client) throw new Error("No email connection found");

    const gmail = google.gmail({ version: "v1", auth: client });
    const emailMessage = createEmailMessage(options);

    const encodedMessage = Buffer.from(emailMessage)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });

    await db
      .update(oauthConnections)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(oauthConnections.id, connectionId));
  },
};

registerEmailProvider(googleEmailProvider);

// googleEmailProvider is registered above via registerEmailProvider()
