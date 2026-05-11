import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { candidates } from "@/db/schema";
import { getPortalProfile, updatePortalProfile } from "@/operations/portal";
import { stripSensitiveIntelligence } from "./privacy";

async function readCandidatePortalProfile(email: string) {
  const profile = await getPortalProfile(email);
  if (!profile) return null;

  return {
    ...profile,
    candidate: {
      ...profile.candidate,
      profile: stripSensitiveIntelligence(profile.candidate.profile ?? {}),
    },
  };
}

async function updateCandidatePortalProfile(
  email: string,
  changes: Record<string, unknown>,
) {
  const profile = await getPortalProfile(email);
  if (!profile) throw new Error("No portal profile found");

  return updatePortalProfile({
    candidateId: profile.primaryCandidateId,
    ...changes,
  });
}

function getNotificationPreferences(preferences: unknown): Record<string, boolean> {
  const prefs = preferences as Record<string, unknown> | null;
  return (prefs?.notifications ?? {}) as Record<string, boolean>;
}

export async function updateNotificationPreferences(
  _candidateId: string,
  _notifications: Record<string, boolean>,
) {
  // No-op until preferences column is re-added
  return null;
}

export function profileCompleteness(candidate: {
  name?: string | null;
  phone?: string | null;
  location?: string | null;
  resumeText?: string | null;
  skills?: string[] | null;
}) {
  const checks = [
    Boolean(candidate.name),
    Boolean(candidate.phone),
    Boolean(candidate.location),
    Boolean(candidate.resumeText),
    Boolean(candidate.skills?.length),
  ];

  const complete = checks.filter(Boolean).length;
  return {
    complete,
    total: checks.length,
    percentage: Math.round((complete / checks.length) * 100),
  };
}
