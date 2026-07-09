/**
 * Org-member listing — used by the per-phase approver picker and the
 * project Members settings page.
 */

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { member, user } from "@/db/schema/auth";
import { getActionContext } from "@/lib/auth/context";

export interface OrgMemberRow {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  role: string;
}

export async function listOrgMembers(): Promise<OrgMemberRow[]> {
  const ctx = await getActionContext();
  const rows = await db
    .select({
      userId: member.userId,
      userName: user.name,
      userEmail: user.email,
      role: member.role,
    })
    .from(member)
    .leftJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, ctx.organizationId));
  return rows;
}

const APPROVER_ROLES: ReadonlySet<string> = new Set(["admin", "owner"]);

/**
 * Org members eligible to be picked as project approvers in the
 * onboarding wizard. Filters `listOrgMembers()` to those with
 * elevated roles (admin / owner) — `member`-role users can author
 * plans but can't decide governance records.
 */
export async function listApproverEligibleMembers(): Promise<OrgMemberRow[]> {
  const all = await listOrgMembers();
  return all.filter((m) => APPROVER_ROLES.has(m.role));
}
