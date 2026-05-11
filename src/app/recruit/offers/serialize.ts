/**
 * Offers list serialization — single source of truth for transforming
 * Drizzle relational query results into client-safe props.
 *
 * Types flow from: DB schema ($inferSelect) → serialize → client component.
 * No manual interfaces in the client — import from here.
 */

import type { Offer, OfferCompensation, OfferCloseRisk, OfferChecklistEntry, OfferOwnership, OfferDeclineReason } from "@/db/schema/offers";
import type { Application } from "@/db/schema/applications";
import type { Candidate } from "@/db/schema/candidates";
import type { Role } from "@/db/schema/roles";

// -- Derived types (what the client receives) ---------------------------

export interface SerializedListOffer {
  id: string;
  candidateName: string | null;
  roleName: string | null;
  status: string;
  compensation: OfferCompensation | null;
  closeRisks: OfferCloseRisk[] | null;
  checklist: OfferChecklistEntry[] | null;
  closeOwnership: OfferOwnership[] | null;
  recommendation: string | null;
  declineReason: OfferDeclineReason | null;
  compBase: string | null;
  compEquity: string | null;
  createdAt: string;
  respondedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
}

export interface OffersListProps {
  inProgress: SerializedListOffer[];
  inProgressTotal: number;
  closedWon: SerializedListOffer[];
  closedWonTotal: number;
  closedLost: SerializedListOffer[];
  closedLostTotal: number;
}

// -- Helpers -------------------------------------------------------------

function serializeDate(d: Date | string | null): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : String(d);
}

// -- Serializer ----------------------------------------------------------

type OfferWithRelations = Offer & {
  application?: (Application & { candidate?: Candidate; role?: Role }) | null;
};

export function serializeListOffer(o: OfferWithRelations): SerializedListOffer {
  return {
    id: o.id,
    candidateName: o.application?.candidate?.name || null,
    roleName: o.application?.role?.title || null,
    status: o.status,
    compensation: (o.compensation as OfferCompensation) ?? null,
    closeRisks: (o.closeRisks as OfferCloseRisk[]) ?? null,
    checklist: (o.checklist as OfferChecklistEntry[]) ?? null,
    closeOwnership: (o.closeOwnership as OfferOwnership[]) ?? null,
    recommendation: o.recommendation,
    declineReason: (o.declineReason as OfferDeclineReason) ?? null,
    compBase: o.compBase,
    compEquity: o.compEquity,
    createdAt: (serializeDate(o.createdAt))!,
    respondedAt: serializeDate(o.respondedAt),
    acceptedAt: serializeDate(o.acceptedAt),
    declinedAt: serializeDate(o.declinedAt),
  };
}

