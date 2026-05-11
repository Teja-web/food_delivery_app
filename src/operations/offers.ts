import { createEntityCrud } from "@/lib/crud";
import { db } from "@/db/client";
import { offers, offerVersions } from "@/db/schema";
import type { OfferCompState, OfferRiskFlags, OfferChangeEntry, OfferTriggerType } from "@/db/schema/offers";
import { eq, and, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { offerSchema } from "./schemas";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { requireNonVendorContext } from "@/lib/auth/context";

const offerCrud = createEntityCrud({
  db,
  table: offers,
  queryKey: "offers",
  idField: "id",
  schema: offerSchema,
  onMutate: () => safeRevalidate("/offers"),
  getWith: { application: { with: { role: true, candidate: true } } },
  searchFields: ["recommendation", "compBase"],
});

/**
 * Vendor guard for every offer entry point. Vendors are blocked from
 * read + write on offers regardless of partnership status (Phase 3).
 */
async function ensureCanAccessOffers() {
  await requireNonVendorContext();
}

export async function getOffers(...args: Parameters<typeof offerCrud.list>) {
  await ensureCanAccessOffers();
  return offerCrud.list(...args);
}
export async function searchOffers(...args: Parameters<typeof offerCrud.search>) {
  await ensureCanAccessOffers();
  return offerCrud.search(...args);
}
export async function getOffer(...args: Parameters<typeof offerCrud.get>) {
  await ensureCanAccessOffers();
  return offerCrud.get(...args);
}
export async function createOffer(...args: Parameters<typeof offerCrud.create>) {
  await ensureCanAccessOffers();
  return offerCrud.create(...args);
}
export async function updateOffer(...args: Parameters<typeof offerCrud.update>) {
  await ensureCanAccessOffers();
  return offerCrud.update(...args);
}
export async function deleteOffer(...args: Parameters<typeof offerCrud.delete>) {
  await ensureCanAccessOffers();
  return offerCrud.delete(...args);
}

export async function getOfferDetail(id: string) {
  await ensureCanAccessOffers();
  return offerCrud.get(id, {
    with: {
      application: { with: { role: true, candidate: true } },
      versions: true,
      intelligence: true,
    },
  });
}

/**
 * Create a new offer version as a decision event.
 * Auto-computes changeVector from the previous version and updates the offer's currentVersionId.
 */
export async function createOfferVersion(
  offerId: string,
  organizationId: string,
  data: {
    triggerType: OfferTriggerType;
    compState: OfferCompState;
    riskFlags?: OfferRiskFlags;
    justification?: string;
    createdBy?: string;
    createdById?: string;
  },
) {
  await ensureCanAccessOffers();
  // Get previous version to compute changeVector and versionNumber
  const previousVersion = await db.query.offerVersions.findFirst({
    where: eq(offerVersions.offerId, offerId),
    orderBy: desc(offerVersions.versionNumber),
  });

  const versionNumber = (previousVersion?.versionNumber ?? 0) + 1;

  // Compute changeVector from previous compState
  let changeVector: { changes: OfferChangeEntry[] } | undefined;
  if (previousVersion) {
    const prev = previousVersion.compState as OfferCompState;
    const next = data.compState;
    const changes: OfferChangeEntry[] = [];

    // Compare components
    const allComponents = new Set([
      ...prev.components.map((c) => c.name),
      ...next.components.map((c) => c.name),
    ]);
    for (const name of allComponents) {
      const prevAmount = prev.components.find((c) => c.name === name)?.amount ?? 0;
      const newAmount = next.components.find((c) => c.name === name)?.amount ?? 0;
      if (prevAmount !== newAmount) {
        changes.push({ component: name, previousAmount: prevAmount, newAmount, delta: newAmount - prevAmount, reason: "" });
      }
    }
    // Compare bonus
    if ((prev.bonus ?? 0) !== (next.bonus ?? 0)) {
      changes.push({ component: "bonus", previousAmount: prev.bonus ?? 0, newAmount: next.bonus ?? 0, delta: (next.bonus ?? 0) - (prev.bonus ?? 0), reason: "" });
    }
    if (changes.length > 0) {
      changeVector = { changes };
    }
  }

  const id = nanoid();
  await db.insert(offerVersions).values({
    id,
    offerId,
    organizationId,
    versionNumber,
    triggerType: data.triggerType,
    changeVector: changeVector ?? null,
    compState: data.compState,
    riskFlags: data.riskFlags ?? null,
    justification: data.justification ?? null,
    createdBy: data.createdBy ?? null,
    createdById: data.createdById ?? null,
  });

  // Update offer's current version pointer
  await db.update(offers).set({ currentVersionId: id, updatedAt: new Date() }).where(eq(offers.id, offerId));

  return { id, versionNumber, action: "created" as const };
}

/**
 * List all versions for an offer, ordered by version number ascending.
 */
export async function getOfferVersions(offerId: string) {
  await ensureCanAccessOffers();
  return db.query.offerVersions.findMany({
    where: eq(offerVersions.offerId, offerId),
    orderBy: offerVersions.versionNumber,
  });
}
