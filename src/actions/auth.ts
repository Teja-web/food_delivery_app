"use server";

import { getSessionInfo, setCandidateRole as setCandidateRoleAction } from "@/lib/auth/actions";

export async function getAuthSessionInfo() {
  return getSessionInfo();
}

export async function setCandidateRole() {
  return setCandidateRoleAction();
}
