"use server";

import { revalidatePath } from "next/cache";
import { getOrgPublicProfile, updateOrgPublicProfile } from "@/operations/organization";

export async function loadOrgPublicProfile() {
  return getOrgPublicProfile();
}

export async function saveOrgPublicProfile(input: unknown) {
  const result = await updateOrgPublicProfile(input);
  revalidatePath("/recruit/settings/identity", "page");
  return result;
}
