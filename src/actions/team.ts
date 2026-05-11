"use server";

import { db } from "@/db/client";
import { member, user, invitation, memberProfiles } from "@/db/schema";
import type { RecruitRole } from "@/db/schema";
import { auth } from "@/lib/auth/index";
import { requireOrgContext } from "@/lib/auth/context";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { nanoid } from "nanoid";

export async function listMembers() {
  const ctx = await requireOrgContext();

  // Reconcile memberProfiles rows that were created with email as placeholder userId
  // during invitation. Now that the user has accepted, migrate to their real userId.
  const staleProfiles = await db
    .select({
      profileId: memberProfiles.id,
      placeholderUserId: memberProfiles.userId,
      recruitRole: memberProfiles.recruitRole,
      realUserId: user.id,
    })
    .from(memberProfiles)
    .innerJoin(user, eq(user.email, memberProfiles.userId))
    .innerJoin(
      member,
      and(
        eq(member.userId, user.id),
        eq(member.organizationId, memberProfiles.organizationId),
      ),
    )
    .where(eq(memberProfiles.organizationId, ctx.organizationId));

  for (const stale of staleProfiles) {
    // Delete the stale email-keyed row and upsert with the real userId
    await db.delete(memberProfiles).where(eq(memberProfiles.id, stale.profileId));
    await db
      .insert(memberProfiles)
      .values({
        id: nanoid(),
        organizationId: ctx.organizationId,
        userId: stale.realUserId,
        recruitRole: stale.recruitRole,
      })
      .onConflictDoUpdate({
        target: [memberProfiles.organizationId, memberProfiles.userId],
        set: { recruitRole: stale.recruitRole, updatedAt: new Date() },
      });
  }

  const members = await db
    .select({
      id: member.id,
      role: member.role,
      createdAt: member.createdAt,
      userId: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      recruitRole: memberProfiles.recruitRole,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .leftJoin(
      memberProfiles,
      and(
        eq(memberProfiles.userId, member.userId),
        eq(memberProfiles.organizationId, member.organizationId),
      ),
    )
    .where(eq(member.organizationId, ctx.organizationId));
  return members;
}

export async function listInvitations() {
  const ctx = await requireOrgContext();
  const invitations = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      inviterId: invitation.inviterId,
    })
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, ctx.organizationId),
        eq(invitation.status, "pending"),
      ),
    );
  return invitations;
}

export async function inviteMember(
  email: string,
  authRole: "admin" | "member",
  recruitRole: RecruitRole,
) {
  const ctx = await requireOrgContext();
  try {
    const result = await auth.api.createInvitation({
      headers: await headers(),
      body: { email, role: authRole, organizationId: ctx.organizationId },
    });
    // Store the recruit role for assignment after the user accepts
    // We store it keyed by invitation email + org so we can look it up on acceptance
    await db.insert(memberProfiles).values({
      id: nanoid(),
      organizationId: ctx.organizationId,
      userId: email, // temporary: use email as placeholder until user accepts
      recruitRole,
    }).onConflictDoUpdate({
      target: [memberProfiles.organizationId, memberProfiles.userId],
      set: { recruitRole, updatedAt: new Date() },
    });
    return { success: true, data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send invitation";
    return { success: false, error: message };
  }
}

export async function updateRecruitRole(userId: string, recruitRole: RecruitRole) {
  const ctx = await requireOrgContext();
  await db.insert(memberProfiles).values({
    id: nanoid(),
    organizationId: ctx.organizationId,
    userId,
    recruitRole,
  }).onConflictDoUpdate({
    target: [memberProfiles.organizationId, memberProfiles.userId],
    set: { recruitRole, updatedAt: new Date() },
  });
  return { success: true };
}

export async function cancelInvitation(invitationId: string) {
  const ctx = await requireOrgContext();
  try {
    await auth.api.cancelInvitation({
      headers: await headers(),
      body: { invitationId },
    });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cancel invitation";
    return { success: false, error: message };
  }
}

export async function removeMember(memberId: string) {
  const ctx = await requireOrgContext();
  try {
    await auth.api.removeMember({
      headers: await headers(),
      body: { memberIdOrEmail: memberId, organizationId: ctx.organizationId },
    });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove member";
    return { success: false, error: message };
  }
}
