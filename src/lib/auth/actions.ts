/**
 * Server-only auth helpers around Better Auth.
 */

import { headers } from "next/headers";
import { auth } from "./index";

export interface CurrentUserContext {
  currentUser: { id: string; name: string; email: string } | null;
  organizationId: string | null;
  role: string;
  isAdmin: boolean;
}

export async function getCurrentUser(): Promise<CurrentUserContext> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { currentUser: null, organizationId: null, role: "guest", isAdmin: false };
  }

  const u = session.user as { id: string; name: string; email: string; role?: string };
  const activeOrgId = (session.session as { activeOrganizationId?: string | null })?.activeOrganizationId ?? null;

  return {
    currentUser: { id: u.id, name: u.name, email: u.email },
    organizationId: activeOrgId,
    role: u.role ?? "member",
    isAdmin: u.role === "admin",
  };
}

export async function getSessionInfo() {
  return getCurrentUser();
}
