import { db } from "@/db/client";
import {
  vendorPartnerships,
  vendorInvitations,
  organization,
  applications,
  interviews,
  orgCandidates,
} from "@/db/schema";
import { and, count, desc, eq, gt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getActionContext, requireNonVendorContext } from "@/lib/auth/context";
import { safeRevalidate } from "@/lib/safe-revalidate";

const INVITATION_TTL_DAYS = 14;

/**
 * Generate a non-guessable accept token. 32 url-safe chars from nanoid is
 * roughly 192 bits — fine for a single-use bearer.
 */
function newAcceptToken() {
  return nanoid(32);
}

export interface VendorPartnershipRow {
  id: string;
  vendorOrgId: string;
  vendorOrgName: string | null;
  status: "active" | "paused";
  createdAt: Date;
  createdByName: string | null;
}

export interface VendorInvitationRow {
  id: string;
  email: string;
  proposedVendorOrgName: string;
  status: "pending" | "accepted" | "cancelled" | "expired";
  expiresAt: Date;
  createdAt: Date;
  createdByName: string | null;
}

/**
 * List partnerships + pending invitations for the current hiring org.
 * Vendor users cannot call this (caller is the hiring-org admin).
 */
export async function listVendorPartnerships(): Promise<{
  partnerships: VendorPartnershipRow[];
  invitations: VendorInvitationRow[];
}> {
  const ctx = await requireNonVendorContext();

  const partnerships = await db
    .select({
      id: vendorPartnerships.id,
      vendorOrgId: vendorPartnerships.vendorOrgId,
      vendorOrgName: organization.name,
      status: vendorPartnerships.status,
      createdAt: vendorPartnerships.createdAt,
      createdByName: vendorPartnerships.createdByName,
    })
    .from(vendorPartnerships)
    .leftJoin(organization, eq(vendorPartnerships.vendorOrgId, organization.id))
    .where(eq(vendorPartnerships.hiringOrgId, ctx.organizationId))
    .orderBy(desc(vendorPartnerships.createdAt));

  const invitations = await db
    .select({
      id: vendorInvitations.id,
      email: vendorInvitations.email,
      proposedVendorOrgName: vendorInvitations.proposedVendorOrgName,
      status: vendorInvitations.status,
      expiresAt: vendorInvitations.expiresAt,
      createdAt: vendorInvitations.createdAt,
      createdByName: vendorInvitations.createdByName,
    })
    .from(vendorInvitations)
    .where(and(
      eq(vendorInvitations.hiringOrgId, ctx.organizationId),
      eq(vendorInvitations.status, "pending"),
    ))
    .orderBy(desc(vendorInvitations.createdAt));

  return {
    partnerships: partnerships.map((p) => ({
      ...p,
      status: p.status as "active" | "paused",
    })),
    invitations: invitations.map((i) => ({
      ...i,
      status: i.status as "pending" | "accepted" | "cancelled" | "expired",
    })),
  };
}

/**
 * Create a vendor partnership invitation. Idempotent on
 * `(hiringOrgId, lower(email))` — repeating an invite for the same address
 * extends the existing pending row's expiry rather than creating a duplicate.
 */
export async function inviteVendor(input: {
  email: string;
  proposedVendorOrgName: string;
}): Promise<{ invitationId: string; acceptUrl: string }> {
  const ctx = await requireNonVendorContext();
  const email = input.email.trim().toLowerCase();
  const proposedVendorOrgName = input.proposedVendorOrgName.trim();

  if (!email || !proposedVendorOrgName) {
    throw new Error("email and proposedVendorOrgName are required");
  }

  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const acceptToken = newAcceptToken();

  // Reuse an existing pending invite if one exists, otherwise insert.
  const existing = await db.query.vendorInvitations.findFirst({
    where: and(
      eq(vendorInvitations.hiringOrgId, ctx.organizationId),
      sql`lower(${vendorInvitations.email}) = ${email}`,
      eq(vendorInvitations.status, "pending"),
    ),
  });

  let invitationId: string;
  let token: string;
  if (existing) {
    await db
      .update(vendorInvitations)
      .set({
        proposedVendorOrgName,
        expiresAt,
        acceptToken,
      })
      .where(eq(vendorInvitations.id, existing.id));
    invitationId = existing.id;
    token = acceptToken;
  } else {
    const [created] = await db
      .insert(vendorInvitations)
      .values({
        hiringOrgId: ctx.organizationId,
        email,
        proposedVendorOrgName,
        acceptToken,
        status: "pending",
        expiresAt,
        createdById: ctx.userId,
        createdByName: ctx.user.name,
      })
      .returning();
    invitationId = created.id;
    token = created.acceptToken;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const acceptUrl = `${baseUrl}/vendor/accept?token=${encodeURIComponent(token)}`;

  // Email delivery is intentionally out of scope for the operation layer.
  // Callers (or a worker rule) should send the email; the URL is returned
  // here so the settings UI can offer a "copy link" affordance.

  safeRevalidate("/recruit/settings/vendors");
  return { invitationId, acceptUrl };
}

export async function cancelVendorInvitation(invitationId: string) {
  const ctx = await requireNonVendorContext();
  const [updated] = await db
    .update(vendorInvitations)
    .set({ status: "cancelled" })
    .where(and(
      eq(vendorInvitations.id, invitationId),
      eq(vendorInvitations.hiringOrgId, ctx.organizationId),
      eq(vendorInvitations.status, "pending"),
    ))
    .returning();
  if (!updated) throw new Error("Invitation not found or not pending");
  safeRevalidate("/recruit/settings/vendors");
  return updated;
}

/**
 * Resend an invitation = re-issue a fresh token + extend expiry. Returns the
 * new accept URL so the UI can copy it. Pending only.
 */
export async function resendVendorInvitation(invitationId: string) {
  const ctx = await requireNonVendorContext();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const acceptToken = newAcceptToken();
  const [updated] = await db
    .update(vendorInvitations)
    .set({ expiresAt, acceptToken })
    .where(and(
      eq(vendorInvitations.id, invitationId),
      eq(vendorInvitations.hiringOrgId, ctx.organizationId),
      eq(vendorInvitations.status, "pending"),
    ))
    .returning();
  if (!updated) throw new Error("Invitation not found or not pending");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const acceptUrl = `${baseUrl}/vendor/accept?token=${encodeURIComponent(updated.acceptToken)}`;
  safeRevalidate("/recruit/settings/vendors");
  return { invitationId: updated.id, acceptUrl };
}

async function setPartnershipStatus(
  partnershipId: string,
  status: "active" | "paused",
) {
  const ctx = await requireNonVendorContext();
  const [updated] = await db
    .update(vendorPartnerships)
    .set({
      status,
      updatedAt: new Date(),
      updatedById: ctx.userId,
      updatedByName: ctx.user.name,
    })
    .where(and(
      eq(vendorPartnerships.id, partnershipId),
      eq(vendorPartnerships.hiringOrgId, ctx.organizationId),
    ))
    .returning();
  if (!updated) throw new Error("Partnership not found");
  safeRevalidate("/recruit/settings/vendors");
  return updated;
}

export async function pauseVendorPartnership(partnershipId: string) {
  return setPartnershipStatus(partnershipId, "paused");
}

export async function resumeVendorPartnership(partnershipId: string) {
  return setPartnershipStatus(partnershipId, "active");
}

/**
 * Permanently revoke a partnership. The vendor's prior contributions
 * (applications, interviews, candidates) stay attributed to them on the
 * hiring org's records; only the access predicate disappears.
 */
export async function revokeVendorPartnership(partnershipId: string) {
  const ctx = await requireNonVendorContext();
  const [deleted] = await db
    .delete(vendorPartnerships)
    .where(and(
      eq(vendorPartnerships.id, partnershipId),
      eq(vendorPartnerships.hiringOrgId, ctx.organizationId),
    ))
    .returning();
  if (!deleted) throw new Error("Partnership not found");
  safeRevalidate("/recruit/settings/vendors");
  return deleted;
}

/**
 * Activity drilldown for one partnership: counts of vendor-attributed rows
 * the hiring org has visibility into. Used by the "View activity" affordance.
 */
export async function getPartnershipActivity(partnershipId: string): Promise<{
  candidatesAdded: number;
  applicationsSubmitted: number;
  interviewsScheduled: number;
}> {
  const ctx = await requireNonVendorContext();
  const partnership = await db.query.vendorPartnerships.findFirst({
    where: and(
      eq(vendorPartnerships.id, partnershipId),
      eq(vendorPartnerships.hiringOrgId, ctx.organizationId),
    ),
  });
  if (!partnership) throw new Error("Partnership not found");

  const [candidatesAdded] = await db
    .select({ n: count() })
    .from(orgCandidates)
    .where(and(
      eq(orgCandidates.organizationId, ctx.organizationId),
      eq(orgCandidates.addedByOrgId, partnership.vendorOrgId),
    ));

  const [applicationsSubmitted] = await db
    .select({ n: count() })
    .from(applications)
    .where(and(
      eq(applications.organizationId, ctx.organizationId),
      eq(applications.submittedByOrgId, partnership.vendorOrgId),
    ));

  // Interviews don't carry submittedByOrgId directly; count interviews whose
  // application was submitted by this vendor.
  const [interviewsScheduled] = await db.execute<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n FROM dilliznt.interviews i
    JOIN dilliznt.applications a ON a.id = i.application_id
    WHERE a.organization_id = ${ctx.organizationId}
      AND a.submitted_by_org_id = ${partnership.vendorOrgId}
  `).then((r) => r.rows);

  return {
    candidatesAdded: Number(candidatesAdded?.n ?? 0),
    applicationsSubmitted: Number(applicationsSubmitted?.n ?? 0),
    interviewsScheduled: Number(interviewsScheduled?.n ?? 0),
  };
}

/**
 * Look up a pending invitation by token. Validates that the token exists and
 * is not expired/cancelled. Used by the accept page; intentionally NOT
 * org-scoped because the invitee may not be a member of any org yet.
 */
export async function findVendorInvitationByToken(token: string) {
  const row = await db.query.vendorInvitations.findFirst({
    where: and(
      eq(vendorInvitations.acceptToken, token),
      eq(vendorInvitations.status, "pending"),
      gt(vendorInvitations.expiresAt, new Date()),
    ),
  });
  return row ?? null;
}
