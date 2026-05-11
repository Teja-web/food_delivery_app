/**
 * Offer detail serialization.
 * Types flow from: DB schema ($inferSelect) → serialize → client component.
 */

import type { Offer, OfferVersion, OfferCompensation, OfferCloseRisk, OfferChecklistEntry, OfferOwnership, ExtractedOfferLetter, ExtractedPayStub, GeneratedOffer, OfferCompState, OfferChangeEntry, OfferRiskFlags, OfferTriggerType, OfferDeclineReason, OfferWithdrawReason } from "@/db/schema/offers";
import type { OfferIntelligenceRow, LeverageAnalysis } from "@/db/schema/intelligence";
import type { Application } from "@/db/schema/applications";
import type { Candidate } from "@/db/schema/candidates";
import type { Role } from "@/db/schema/roles";

// -- Derived types ---------------------------------------------------

export interface SerializedOfferVersion {
  id: string;
  versionNumber: number;
  triggerType: OfferTriggerType;
  changeVector: { changes: OfferChangeEntry[] } | null;
  compState: OfferCompState;
  riskFlags: OfferRiskFlags | null;
  justification: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface SerializedOfferDetail {
  id: string;
  status: string;
  candidateName: string | null;
  candidateTitle: string | null;
  candidateLocation: string | null;
  roleTitle: string | null;
  roleId: string | null;
  applicationId: string;
  compBase: string | null;
  compEquity: string | null;
  compBonus: string | null;
  compensation: OfferCompensation | null;
  closeRisks: OfferCloseRisk[] | null;
  checklist: OfferChecklistEntry[] | null;
  closeOwnership: OfferOwnership[] | null;
  recommendation: string | null;
  extractedOfferLetter: ExtractedOfferLetter | null;
  extractedPayStubs: ExtractedPayStub[] | null;
  generatedOffer: GeneratedOffer | null;
  roleCompensation: { min?: number; max?: number; currency?: string } | null;
  versions: SerializedOfferVersion[];
  currentVersion: SerializedOfferVersion | null;
  declineReason: OfferDeclineReason | null;
  withdrawReason: OfferWithdrawReason | null;
  withdrawnAt: string | null;
  leverage: {
    score: number;
    factors: Array<{ factor: string; signal: string; impact: "increases" | "decreases" }>;
    strategy: "aggressive_open" | "market_rate" | "premium_required";
    closeProbability: number;
  } | null;
  documentUrl: string | null;
  validUntil: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  createdAt: string;
}

// -- Helpers --------------------------------------------------------

function serializeDate(d: Date | string | null): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : String(d);
}

// -- Serializer -----------------------------------------------------

type OfferWithRelations = Offer & {
  application?: (Application & { candidate?: Candidate; role?: Role }) | null;
  versions?: OfferVersion[];
  intelligence?: OfferIntelligenceRow | null;
};

function serializeVersion(v: OfferVersion): SerializedOfferVersion {
  return {
    id: v.id,
    versionNumber: v.versionNumber,
    triggerType: v.triggerType as OfferTriggerType,
    changeVector: (v.changeVector as { changes: OfferChangeEntry[] }) ?? null,
    compState: v.compState as OfferCompState,
    riskFlags: (v.riskFlags as OfferRiskFlags) ?? null,
    justification: v.justification,
    createdBy: v.createdBy,
    createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt),
  };
}

export function serializeOfferDetail(o: OfferWithRelations): SerializedOfferDetail {
  const roleComp = o.application?.role?.compensation as Record<string, unknown> | null;
  const versions = (o.versions ?? [])
    .sort((a, b) => a.versionNumber - b.versionNumber)
    .map(serializeVersion);
  const currentVersion = o.currentVersionId
    ? versions.find((v) => v.id === o.currentVersionId) ?? versions[versions.length - 1] ?? null
    : versions[versions.length - 1] ?? null;

  return {
    id: o.id,
    status: o.status,
    candidateName: o.application?.candidate?.name || null,
    candidateTitle: o.application?.candidate?.title || null,
    candidateLocation: o.application?.candidate?.location || null,
    roleTitle: o.application?.role?.title || null,
    roleId: o.roleId,
    applicationId: o.applicationId,
    compBase: o.compBase,
    compEquity: o.compEquity,
    compBonus: o.compBonus,
    compensation: (o.compensation as OfferCompensation) ?? null,
    closeRisks: (o.closeRisks as OfferCloseRisk[]) ?? null,
    checklist: (o.checklist as OfferChecklistEntry[]) ?? null,
    closeOwnership: (o.closeOwnership as OfferOwnership[]) ?? null,
    recommendation: o.recommendation,
    extractedOfferLetter: (o.extractedOfferLetter as ExtractedOfferLetter) ?? null,
    extractedPayStubs: (o.extractedPayStubs as ExtractedPayStub[]) ?? null,
    generatedOffer: (o.generatedOffer as GeneratedOffer) ?? null,
    roleCompensation: roleComp ? { min: roleComp.min as number, max: roleComp.max as number, currency: roleComp.currency as string } : null,
    versions,
    currentVersion,
    declineReason: (o.declineReason as OfferDeclineReason) ?? null,
    withdrawReason: (o.withdrawReason as OfferWithdrawReason) ?? null,
    withdrawnAt: serializeDate(o.withdrawnAt),
    leverage: (() => {
      const la = o.intelligence?.leverageAnalysis as LeverageAnalysis | null;
      if (!la) return null;
      return {
        score: la.leverageScore,
        factors: la.leverageFactors,
        strategy: la.negotiationStrategy,
        closeProbability: la.closeProbability,
      };
    })(),
    documentUrl: o.documentUrl,
    validUntil: serializeDate(o.validUntil),
    sentAt: serializeDate(o.sentAt),
    respondedAt: serializeDate(o.respondedAt),
    acceptedAt: serializeDate(o.acceptedAt),
    declinedAt: serializeDate(o.declinedAt),
    createdAt: (serializeDate(o.createdAt))!,
  };
}
