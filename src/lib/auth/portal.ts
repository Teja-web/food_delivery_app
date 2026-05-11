/**
 * Portal Auth — candidate portal session management.
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "./actions";

interface PortalCandidateSession {
  userId: string;
  email: string;
  name: string | null;
}

export async function requirePortalCandidateSession(): Promise<PortalCandidateSession> {
  const userContext = await getCurrentUser();

  if (!userContext?.currentUser) {
    redirect("/auth/sign-in?mode=candidate");
  }

  const { currentUser } = userContext;

  // Only users with "candidate" or unset role can access the portal
  if (currentUser.role && currentUser.role !== "user" && currentUser.role !== "candidate") {
    redirect("/recruit/today");
  }

  return {
    userId: currentUser.id,
    email: currentUser.email,
    name: currentUser.name ?? null,
  };
}

async function getPortalCandidateSession(): Promise<PortalCandidateSession | null> {
  const userContext = await getCurrentUser();

  if (!userContext?.currentUser) {
    return null;
  }

  const { currentUser } = userContext;

  return {
    userId: currentUser.id,
    email: currentUser.email,
    name: currentUser.name ?? null,
  };
}
