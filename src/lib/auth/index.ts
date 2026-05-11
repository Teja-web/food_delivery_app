/**
 * Recruit Auth — standalone better-auth config.
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
import { render } from "@react-email/components";
import { OrganizationInvitationEmail } from "@/components/emails/organization-invitation";
import { PasswordResetEmail } from "@/components/emails/password-reset";
import { createGmailAPITransporter } from "@/lib/email/gmail-api";

const appUrl =
  process.env.BETTER_AUTH_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3029";

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
      const html = await render(
        PasswordResetEmail({
          resetLink: url,
          userName: user.name,
        })
      );
      const fromEmail = process.env.APP_FROM_EMAIL || process.env.GMAIL_USER;
      if (!fromEmail || !process.env.GOOGLE_REFRESH_TOKEN) {
        throw new Error("Email not configured. Set GOOGLE_REFRESH_TOKEN and GMAIL_USER environment variables.");
      }
      const transporter = createGmailAPITransporter();
      await transporter.sendMail({
        from: `Dilliznt <${fromEmail}>`,
        to: user.email,
        subject: "Reset your Dilliznt password",
        html,
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
    ...(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET && {
      linkedin: {
        clientId: process.env.LINKEDIN_CLIENT_ID,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      },
    }),
  },
  plugins: [
    nextCookies(),
    organization({
      allowUserToCreateOrganization: false,
      async sendInvitationEmail({ email, inviter, organization, invitation }) {
        const inviteLink = `${appUrl}/accept-invitation/${invitation.id}`;
        const html = await render(
          OrganizationInvitationEmail({
            inviterName: inviter.user.name || inviter.user.email,
            organizationName: organization.name,
            inviteLink,
            role: invitation.role || "member",
          })
        );
        const fromEmail = process.env.APP_FROM_EMAIL || process.env.GMAIL_USER;
        if (!fromEmail || !process.env.GOOGLE_REFRESH_TOKEN) {
          throw new Error("Email not configured. Set GOOGLE_REFRESH_TOKEN and GMAIL_USER (or APP_FROM_EMAIL) environment variables.");
        }
        const transporter = createGmailAPITransporter();
        await transporter.sendMail({
          from: `Dilliznt <${fromEmail}>`,
          to: email,
          subject: `You've been invited to join ${organization.name}`,
          html,
        });
      },
    }),
    adminPlugin(),
  ],
});
