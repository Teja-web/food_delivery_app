/**
 * Vendor invitation accept — single transaction that:
 *   1. Finds or creates an `auth.organization` row with type="vendor".
 *   2. Adds the invitee as `auth.member` of that org with role="owner".
 *   3. Creates the `vendor_partnerships` row with status="active".
 *   4. Marks the invitation accepted.
 *   5. Sets the user's session.activeOrganizationId to the vendor org so the
 *      next request lands in vendor scope.
 *
 * Idempotent at the partnership level via the unique constraint on
 * (hiringOrgId, vendorOrgId): re-accepting an invite from the same vendor
 * is a no-op for the partnership row.
 */

import { db } from "@/db/client";
import {
  organization,
  member,
  session,
  vendorPartnerships,
  vendorInvitations,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function acceptVendorInvitation(
  invitationId: string,
  user: { userId: string; userName: string },
): Promise<{ vendorOrgId: string; vendorOrgName: string }> {
  return db.transaction(async (tx) => {
    const invite = await tx.query.vendorInvitations.findFirst({
      where: and(
        eq(vendorInvitations.id, invitationId),
        eq(vendorInvitations.status, "pending"),
      ),
    });
    if (!invite) throw new Error("Invitation no longer valid");

    // Find an existing vendor org owned by this user, if any. Reuses the
    // org so a vendor user can accept multiple partnerships under one shop.
    const existingMembership = await tx.query.member.findFirst({
      where: eq(member.userId, user.userId),
    });

    let vendorOrgId: string;
    let vendorOrgName: string;
    if (existingMembership) {
      const existingOrg = await tx.query.organization.findFirst({
        where: eq(organization.id, existingMembership.organizationId),
      });
      if (existingOrg && existingOrg.type === "vendor") {
        vendorOrgId = existingOrg.id;
        vendorOrgName = existingOrg.name;
      } else {
        // User already belongs to a non-vendor org. Create a fresh vendor
        // org alongside it; the org switcher handles multi-org users.
        const created = await createVendorOrgAndOwnerMembership(tx, invite.proposedVendorOrgName, user);
        vendorOrgId = created.vendorOrgId;
        vendorOrgName = created.vendorOrgName;
      }
    } else {
      const created = await createVendorOrgAndOwnerMembership(tx, invite.proposedVendorOrgName, user);
      vendorOrgId = created.vendorOrgId;
      vendorOrgName = created.vendorOrgName;
    }

    // Insert the partnership idempotently.
    await tx
      .insert(vendorPartnerships)
      .values({
        hiringOrgId: invite.hiringOrgId,
        vendorOrgId,
        status: "active",
        createdById: user.userId,
        createdByName: user.userName,
      })
      .onConflictDoNothing();

    await tx
      .update(vendorInvitations)
      .set({
        status: "accepted",
        acceptedAt: new Date(),
        acceptedByUserId: user.userId,
      })
      .where(eq(vendorInvitations.id, invitationId));

    // Set the active org outside the transaction (better-auth session table
    // updates may not compose with the same tx). The TX completes first.
    await setActiveOrgAfterTx(user.userId, vendorOrgId);

    return { vendorOrgId, vendorOrgName };
  });
}

async function createVendorOrgAndOwnerMembership(
  tx: any,
  proposedName: string,
  user: { userId: string; userName: string },
): Promise<{ vendorOrgId: string; vendorOrgName: string }> {
  const vendorOrgId = nanoid();
  await tx.insert(organization).values({
    id: vendorOrgId,
    name: proposedName,
    type: "vendor",
  });
  await tx.insert(member).values({
    id: nanoid(),
    organizationId: vendorOrgId,
    userId: user.userId,
    role: "owner",
  });
  return { vendorOrgId, vendorOrgName: proposedName };
}

async function setActiveOrgAfterTx(userId: string, organizationId: string) {
  // Update every active session for this user to point at the new vendor org.
  // Done outside the transaction because better-auth manages the session
  // table and may have its own listeners.
  await db
    .update(session)
    .set({ activeOrganizationId: organizationId })
    .where(eq(session.userId, userId));
  // Ensure the *current* session is updated even if multiple were active.
  try {
    const headersList = await headers();
    const current = await auth.api.getSession({ headers: headersList });
    if (current) {
      await db
        .update(session)
        .set({ activeOrganizationId: organizationId })
        .where(eq(session.id, current.session.id));
    }
  } catch {
    // Best-effort; the bulk update above is the primary guarantee.
  }
}
