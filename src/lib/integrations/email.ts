/**
 * Shared email provider interface.
 *
 * Provider implementations conform to this contract.
 * Route handlers and actions import from here — never from a specific provider.
 */

import { db } from "@/db/client";
import { oauthConnections } from "@/db/schema/integrations";
import { eq, and } from "drizzle-orm";

// -- Types -----------------------------------------------------------

export type EmailProvider = "google-email" | "outlook-email";

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

export interface EmailProviderImpl {
  provider: EmailProvider;
  getAuthUrl(userId: string, orgId: string): string | Promise<string>;
  exchangeCodeForTokens(code: string, userId: string, orgId: string): Promise<string>;
  sendEmail(connectionId: string, options: SendEmailOptions): Promise<void>;
}

// -- Provider registry -----------------------------------------------

const providers = new Map<EmailProvider, EmailProviderImpl>();

export function registerEmailProvider(impl: EmailProviderImpl) {
  providers.set(impl.provider, impl);
}

export function getEmailProvider(provider: EmailProvider): EmailProviderImpl {
  const impl = providers.get(provider);
  if (!impl) throw new Error(`Email provider "${provider}" is not registered`);
  return impl;
}

// -- Provider-agnostic helpers (used by routes & actions) ------------

export async function getUserEmailConnection(userId: string) {
  const [connection] = await db
    .select({
      id: oauthConnections.id,
      email: oauthConnections.accountEmail,
      provider: oauthConnections.provider,
    })
    .from(oauthConnections)
    .where(
      and(
        eq(oauthConnections.userId, userId),
        eq(oauthConnections.category, "email"),
        eq(oauthConnections.status, "active")
      )
    )
    .limit(1);
  return connection ?? null;
}

export async function disconnectEmail(userId: string) {
  await db
    .delete(oauthConnections)
    .where(
      and(
        eq(oauthConnections.userId, userId),
        eq(oauthConnections.category, "email")
      )
    );
}

// -- Test email override ---------------------------------------------

/**
 * If TEST_EMAIL_BASE is set, override recipient email to route to test inbox.
 * e.g. TEST_EMAIL_BASE=testingprofiles.azntai@gmail.com
 *      "john.doe@example.com" → "testingprofiles.azntai+john_doe@gmail.com"
 */
function getTestEmail(originalEmail: string): string {
  const testBase = process.env.TEST_EMAIL_BASE;
  if (!testBase) return originalEmail;

  const namePart = originalEmail.split("@")[0];
  const sanitizedName = namePart.replace(/[^a-zA-Z0-9]/g, "_");

  const atIndex = testBase.indexOf("@");
  if (atIndex === -1) return originalEmail;

  const baseLocal = testBase.slice(0, atIndex);
  const baseDomain = testBase.slice(atIndex + 1);

  return `${baseLocal}+${sanitizedName}@${baseDomain}`;
}

function applyTestEmailOverride(to: string | string[]): string | string[] {
  if (Array.isArray(to)) {
    return to.map(getTestEmail);
  }
  return getTestEmail(to);
}

/**
 * Send an email using the current user's connected email provider.
 */
export async function sendEmailViaProvider(
  userId: string,
  options: SendEmailOptions,
): Promise<boolean> {
  const conn = await getUserEmailConnection(userId);
  if (!conn) {
    console.warn("[sendEmailViaProvider] No active email connection for user:", userId);
    return false;
  }
  const impl = providers.get(conn.provider as EmailProvider);
  if (!impl) {
    console.warn("[sendEmailViaProvider] Provider not registered:", conn.provider);
    return false;
  }

  const overriddenOptions = {
    ...options,
    to: applyTestEmailOverride(options.to),
  };

  try {
    await impl.sendEmail(conn.id, overriddenOptions);
    return true;
  } catch (error) {
    console.error("[sendEmailViaProvider] Send failed", {
      provider: conn.provider,
      userId,
      to: options.to,
      subject: options.subject,
      error,
    });
    return false;
  }
}
