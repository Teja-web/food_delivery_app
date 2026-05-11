"use server";

import { revalidatePath } from "next/cache";
import {
  createCampusInvite,
  isUniversityOrg,
  listCampusInvites,
  revokeCampusInvite,
  type CreateCampusInviteInput,
} from "@/operations/campus";
import { getActionContext } from "@/lib/auth/context";

export async function fetchCampusInvites() {
  const ctx = await getActionContext();
  const isUni = await isUniversityOrg(ctx.organizationId);
  if (!isUni) return [];
  return listCampusInvites();
}

export async function createCampusInviteAction(input: CreateCampusInviteInput) {
  const ctx = await getActionContext();
  const isUni = await isUniversityOrg(ctx.organizationId);
  if (!isUni) throw new Error("Only universities can issue campus invites");
  const created = await createCampusInvite(input);
  revalidatePath("/recruit/settings/campus-invites", "page");
  return created;
}

export async function revokeCampusInviteAction(id: string) {
  const ctx = await getActionContext();
  const isUni = await isUniversityOrg(ctx.organizationId);
  if (!isUni) throw new Error("Only universities can revoke campus invites");
  const revoked = await revokeCampusInvite(id);
  revalidatePath("/recruit/settings/campus-invites", "page");
  return revoked;
}
