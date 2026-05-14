"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db/client";
import { member, session, user } from "@/db/schema";

import { auth } from "./index";

interface CurrentUserContext {
  currentUser: { id: string; name: string; email: string } | null;
  organizationId: string | null;
  role: string;
  isAdmin: boolean;
}

const GUEST_CONTEXT: CurrentUserContext = {
  currentUser: null,
  organizationId: null,
  role: "guest",
  isAdmin: false,
};

async function getFreshActiveOrgId(sessionId: string): Promise<string | null> {
  const row = await (db as any).query.session.findFirst({
    where: eq(session.id, sessionId),
  });
  return row?.activeOrganizationId ?? null;
}

export async function getCurrentUser(): Promise<CurrentUserContext> {
  const authSession = await auth.api.getSession({ headers: await headers() });
  if (!authSession?.user) return GUEST_CONTEXT;

  const u = await (db as any).query.user.findFirst({
    where: eq(user.id, authSession.user.id),
  });
  if (!u) return GUEST_CONTEXT;

  const currentUser = { id: u.id, name: u.name, email: u.email };
  const isAdmin = u.role === "admin";

  // Re-read activeOrganizationId from the session row. Better Auth's cached
  // session object can lag behind a just-completed update (e.g. an org
  // switcher server action that mutated the row mid-request).
  const activeOrgId = await getFreshActiveOrgId(authSession.session.id);

  if (activeOrgId) {
    const membership = await (db as any).query.member.findFirst({
      where: and(eq(member.userId, u.id), eq(member.organizationId, activeOrgId)),
    });
    if (membership) {
      return { currentUser, organizationId: membership.organizationId, role: membership.role, isAdmin };
    }
  }

  // Better Auth doesn't auto-set activeOrganizationId on sign-in, so a freshly
  // signed-in org owner/member has a null session.activeOrganizationId until
  // the client explicitly calls setActive(). Fall back to first membership.
  const firstMembership = await (db as any).query.member.findFirst({
    where: eq(member.userId, u.id),
  });
  if (firstMembership) {
    return { currentUser, organizationId: firstMembership.organizationId, role: firstMembership.role, isAdmin };
  }

  return { currentUser, organizationId: null, role: "member", isAdmin };
}

export async function getSessionInfo() {
  return getCurrentUser();
}
