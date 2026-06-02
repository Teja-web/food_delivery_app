"use server";

import { revalidatePath } from "next/cache";

import { getActionContext } from "@/lib/auth/context";
import {
  listRepoPolicies,
  setRepoPolicy,
} from "@/operations/integration/repo-policies";
import type { RepoPolicy } from "@/db/schema/repo-policy";

export async function listRepoPoliciesAction() {
  const ctx = await getActionContext();
  return listRepoPolicies(ctx.organizationId);
}

export async function setRepoPolicyAction(
  remoteCanonical: string,
  policy: RepoPolicy,
) {
  const ctx = await getActionContext();
  const row = await setRepoPolicy(ctx.organizationId, remoteCanonical, policy, {
    actorId: ctx.userId,
    actorName: ctx.user.name,
  });
  revalidatePath("/settings/repos");
  return row;
}
