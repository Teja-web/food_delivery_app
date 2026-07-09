/**
 * Coznt Auth — standalone better-auth config.
 *
 * Email sender is intentionally a no-op stub for now. Wire a real transport
 * (SES, Resend, Postmark, etc.) before exposing password reset or
 * invitation flows to users.
 */

import { db } from "@/db/client";
import {
  user,
  session,
  account,
  verification,
  organization as organizationTable,
  member,
  invitation,
} from "@/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization, admin as adminPlugin } from "better-auth/plugins";

import { ac, roles } from "./permissions";

const appUrl =
  process.env.BETTER_AUTH_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3029";

async function sendEmailStub(args: { to: string; subject: string; body: string }) {
  console.warn(`[auth/email-stub] would send to=${args.to} subject="${args.subject}"`);
  console.warn(args.body);
}

export const auth = betterAuth({
  database: drizzleAdapter(db as any, {
    provider: "pg",
    schema: {
      user,
      session,
      account,
      verification,
      organization: organizationTable,
      member,
      invitation,
    },
  }),
  baseURL: appUrl,
  basePath: "/api/auth",
  trustedOrigins: [appUrl],
  emailAndPassword: {
    enabled: true,
    async sendResetPassword({ user, url }) {
      await sendEmailStub({
        to: user.email,
        subject: "Reset your Coznt password",
        body: `Reset link: ${url}`,
      });
    },
  },
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      },
    }),
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET && {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      },
    }),
  },
  plugins: [
    nextCookies(),
    organization({
      allowUserToCreateOrganization: false,
      ac,
      roles,
      async sendInvitationEmail({ email, inviter, organization, invitation }) {
        const inviteLink = `${appUrl}/accept-invitation/${invitation.id}`;
        await sendEmailStub({
          to: email,
          subject: `You've been invited to join ${organization.name}`,
          body: `Invited by ${inviter.user.name || inviter.user.email}. Accept: ${inviteLink}`,
        });
      },
    }),
    adminPlugin(),
  ],
});
