import { notFound } from "next/navigation";
import { fetchPortalRoleDetailForOffer, fetchPortalOffer } from "@/actions/portal";
import { OfferTabClient } from "./OfferTabClient";
import type { OfferCompState, OfferTriggerType, OfferChangeEntry } from "@/db/schema/offers";

interface SerializedPortalVersion {
  versionNumber: number;
  triggerType: OfferTriggerType;
  compState: OfferCompState;
  changeVector: { changes: OfferChangeEntry[] } | null;
  createdBy: string | null;
  createdAt: string;
}

interface SerializedPortalOffer {
  id: string;
  status: string;
  compState: OfferCompState | null;
  hikePercentage: number | null;
  validUntil: string | null;
  versions: SerializedPortalVersion[];
}

export default async function OfferTabPage({
  params,
}: {
  params: Promise<{ roleId: string }>;
}) {
  const { roleId } = await params;

  const role = await fetchPortalRoleDetailForOffer(roleId);
  if (!role || !role.applicationId) notFound();

  const offer = await fetchPortalOffer(role.applicationId);
  if (!offer) notFound();

  // Serialize — only expose what the candidate should see
  const versions: SerializedPortalVersion[] = (offer.versions ?? []).map((v: any) => ({
    versionNumber: v.versionNumber,
    triggerType: v.triggerType as OfferTriggerType,
    compState: v.compState as OfferCompState,
    changeVector: v.changeVector as { changes: OfferChangeEntry[] } | null,
    createdBy: v.createdBy,
    createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt),
  }));

  const currentVersion = versions[versions.length - 1] ?? null;
  const generatedOffer = offer.generatedOffer as any;
  const extractedOffer = offer.extractedOfferLetter as any;

  const serialized: SerializedPortalOffer = {
    id: offer.id,
    status: offer.status,
    compState: currentVersion?.compState ?? null,
    hikePercentage: generatedOffer?.hike?.percentage ?? null,
    validUntil: offer.validUntil ? (offer.validUntil instanceof Date ? offer.validUntil.toISOString() : String(offer.validUntil)) : null,
    versions,
  };

  return (
    <OfferTabClient
      offer={serialized}
      applicationId={role.applicationId}
      currentCompTotalCtc={extractedOffer?.totalCtc ?? null}
      currentCompCurrency={extractedOffer?.currency ?? null}
    />
  );
}
