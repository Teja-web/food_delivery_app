"use server";

import {
  cancelVendorInvitation,
  getPartnershipActivity,
  inviteVendor,
  listVendorPartnerships,
  pauseVendorPartnership,
  resendVendorInvitation,
  resumeVendorPartnership,
  revokeVendorPartnership,
} from "@/operations/vendor-partnerships";

export async function fetchVendorPartnerships() {
  return listVendorPartnerships();
}

export async function inviteVendorAction(input: { email: string; proposedVendorOrgName: string }) {
  return inviteVendor(input);
}

export async function cancelVendorInvitationAction(invitationId: string) {
  return cancelVendorInvitation(invitationId);
}

export async function resendVendorInvitationAction(invitationId: string) {
  return resendVendorInvitation(invitationId);
}

export async function pauseVendorPartnershipAction(partnershipId: string) {
  return pauseVendorPartnership(partnershipId);
}

export async function resumeVendorPartnershipAction(partnershipId: string) {
  return resumeVendorPartnership(partnershipId);
}

export async function revokeVendorPartnershipAction(partnershipId: string) {
  return revokeVendorPartnership(partnershipId);
}

export async function fetchPartnershipActivity(partnershipId: string) {
  return getPartnershipActivity(partnershipId);
}
