"use server";

import { db } from "@/db/client";
import { member, user, session } from "@/db/schema";
import { auth } from "./index";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

function isUserAdmin(u: { id: string; role?: string | null }): boolean {
  if (u.role === "admin") return true;
  const adminUserIds = process.env.ADMIN_USER_IDS?.split(",").filter(Boolean) || [];
  return adminUserIds.includes(u.id);
}

async function getFreshActiveOrgId(sessionId: string): Promise<string | null> {
  const freshSession = await (db as any).query.session.findFirst({
    where: eq(session.id, sessionId),
  });
  return freshSession?.activeOrganizationId || null;
}

export async function getCurrentUser() {
  const headersList = await headers();

  const authSession = await auth.api.getSession({ headers: headersList });
  if (!authSession) {
    redirect("/auth/sign-in");
  }

  const currentUser = await (db as any).query.user.findFirst({
    where: eq(user.id, authSession.user.id),
  });
  if (!currentUser) {
    redirect("/auth/sign-in");
  }

  const isAdmin = isUserAdmin(currentUser);
  const activeOrgId = await getFreshActiveOrgId(authSession.session.id);

  if (isAdmin) {
    return {
      ...authSession,
      currentUser,
      organizationId: activeOrgId,
      role: "PLATFORM_ADMIN",
      isAdmin: true,
      isImpersonating: false,
    };
  }

  // Candidates don't require org membership
  if (currentUser.role === "candidate") {
      return {
          ...authSession,
          currentUser,
          organizationId: activeOrgId,
          role: "candidate",
          isAdmin: false,
          isImpersonating: false,
      };
  }

  // Use active org if set
  if (activeOrgId) {
    const membership = await (db as any).query.member.findFirst({
      where: (members: any, { and, eq: eqFn }: any) =>
        and(
          eqFn(members.userId, authSession.user.id),
          eqFn(members.organizationId, activeOrgId),
        ),
    });

    if (membership) {
      return {
        ...authSession,
        currentUser,
        organizationId: membership.organizationId,
        role: membership.role,
        isAdmin: false,
        isImpersonating: false,
      };
    }
  }

  // Fall back to first membership
  const membership = await (db as any).query.member.findFirst({
    where: eq(member.userId, authSession.user.id),
  });

  if (!membership) {
    redirect("/auth/sign-in?error=no_membership");
  }

  return {
    ...authSession,
    currentUser,
    organizationId: membership.organizationId,
    role: membership.role,
    isAdmin: false,
    isImpersonating: false,
  };
}

/**
 * Get session info for the currently authenticated user.
 * Used by the auth callback to determine routing (recruiter vs candidate).
 */
export async function getSessionInfo() {
  try {
    const authSession = await auth.api.getSession({
      headers: await headers(),
    });
    if (!authSession) {
      return { success: false as const, error: "Not authenticated" };
    }

    const currentUser = await (db as any).query.user.findFirst({
      where: eq(user.id, authSession.user.id),
    });
    if (!currentUser) {
      return { success: false as const, error: "User not found" };
    }

    const isPlatformAdmin = isUserAdmin(currentUser);
    const activeOrgId = await getFreshActiveOrgId(authSession.session.id);

    let organizationId: string | null = null;

    if (!isPlatformAdmin) {
      const membership = await (db as any).query.member.findFirst({
        where: eq(member.userId, currentUser.id),
      });
      organizationId = membership?.organizationId || null;
    } else {
      organizationId = activeOrgId;
    }

    return {
      success: true as const,
      organizationId,
      isAdmin: isPlatformAdmin,
    };
  } catch (error) {
    console.error("Error getting session info:", error);
    return { success: false as const, error: "Failed to get session info" };
  }
}

/**
 * Set the current user's role to "candidate".
 * Called from the callback page when a user signs in via candidate mode.
 */
export async function setCandidateRole(): Promise<{ success: boolean; error?: string }> {
  try {
    const authSession = await auth.api.getSession({
      headers: await headers(),
    });
    if (!authSession) {
      return { success: false, error: "Not authenticated" };
    }

    const currentUser = await db.query.user.findFirst({
      where: eq(user.id, authSession.user.id),
    });

    if (!currentUser) {
      return { success: false, error: "User not found" };
    }

    // Only set role if not already set (don't override admin or existing role)
    if (!currentUser.role || currentUser.role === "user") {
      await db
        .update(user)
        .set({ role: "candidate" })
        .where(eq(user.id, currentUser.id));
    }

    return { success: true };
  } catch (error) {
    console.error("Error setting candidate role:", error);
    return { success: false, error: "Failed to set role" };
  }
}
