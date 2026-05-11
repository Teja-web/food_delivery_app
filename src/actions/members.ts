"use server";

import { db } from "@/db/client";
import { invitation, organization, user, session, member } from "@/db/schema";
import { auth } from "@/lib/auth/index";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";

export async function getInvitation(invitationId: string) {
  const result = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      organizationId: invitation.organizationId,
      inviterId: invitation.inviterId,
    })
    .from(invitation)
    .where(eq(invitation.id, invitationId))
    .limit(1);

  if (!result.length) {
    return null;
  }

  const inv = result[0];

  // Get organization name
  const org = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, inv.organizationId))
    .limit(1);

  // Get inviter name
  const inviter = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, inv.inviterId))
    .limit(1);

  return {
    id: inv.id,
    email: inv.email,
    role: inv.role,
    status: inv.status,
    expiresAt: inv.expiresAt,
    organizationName: org[0]?.name || "Organization",
    inviterName: inviter[0]?.name || "A team member",
  };
}

export async function createAccountForInvitation(data: {
  name: string;
  email: string;
  password: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if user already exists
    const existing = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, data.email))
      .limit(1);

    if (existing.length > 0) {
      return { success: false, error: "An account with this email already exists. Please sign in instead." };
    }

    // Create user via better-auth
    const result = await auth.api.signUpEmail({
      body: {
        email: data.email,
        password: data.password,
        name: data.name,
      },
    });

    if (!result) {
      return { success: false, error: "Failed to create account" };
    }

    return { success: true };
  } catch (error) {
    console.error("Error creating account for invitation:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create account",
    };
  }
}

export async function checkUserExistsByEmail(email: string): Promise<boolean> {
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email.toLowerCase().trim()))
    .limit(1);
  return existing.length > 0;
}

export async function setActiveOrgAfterInvitation(invitationId: string): Promise<void> {
  try {
    // Get the invitation to find the organization
    const inv = await db
      .select({ organizationId: invitation.organizationId })
      .from(invitation)
      .where(eq(invitation.id, invitationId))
      .limit(1);

    if (!inv.length) return;

    const organizationId = inv[0].organizationId;

    // Get current session
    const headersList = await headers();
    const authSession = await auth.api.getSession({ headers: headersList });

    if (!authSession?.session?.id) return;

    // Update the session's active organization
    await db
      .update(session)
      .set({ activeOrganizationId: organizationId })
      .where(eq(session.id, authSession.session.id));
  } catch (error) {
    console.error("Error setting active org after invitation:", error);
  }
}
