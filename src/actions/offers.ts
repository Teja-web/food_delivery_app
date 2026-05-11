"use server";

import { z } from "zod/v4";
import {
  getOffers as _getOffers,
  getOffer as _getOffer,
  getOfferDetail as _getOfferDetail,
  createOffer as _createOffer,
  updateOffer as _updateOffer,
  deleteOffer as _deleteOffer,
} from "../operations/offers";
import { getActionContext } from "@/lib/auth/context";
import { storeFile } from "@/lib/storage";
import { extractTextFromFile } from "@/lib/markitdown";
import { generate } from "@/lib/ai";
import { offerLetterExtractorAgent, offerLetterExtractionSchema } from "@/automations/agents/definitions/offer-letter-extractor";
import { offerLetterExtractorPromptWithContext } from "@/automations/agents/prompts/offer-letter-extractor";
import { payStubExtractorAgent, payStubExtractionSchema } from "@/automations/agents/definitions/pay-stub-extractor";
import { payStubExtractorPromptWithContext } from "@/automations/agents/prompts/pay-stub-extractor";
import { offerGenerateRecommendation } from "@/automations/tasks/offer";
import { createOfferVersion } from "@/operations/offers";
import type { ExtractedOfferLetter, ExtractedPayStub, OfferCompState, OfferWithdrawReason } from "@/db/schema/offers";
import { sendEmailViaProvider } from "@/lib/integrations/email";
import "@/lib/integrations/register-providers";
import { render } from "@react-email/components";
import { OfferLetterEmail } from "@/components/emails/offer-letter";
import { OfferWithdrawalEmail } from "@/components/emails/offer-withdrawal";

export async function listOffers(opts?: { offset?: number; limit?: number; sortBy?: string; sortOrder?: "asc" | "desc"; where?: (table: any) => any }) {
  return _getOffers(opts);
}

const IN_PROGRESS_STATUSES = ["draft", "sent", "negotiating"];
const CLOSED_WON_STATUSES = ["accepted"];
const CLOSED_LOST_STATUSES = ["declined", "withdrawn"];

export async function listInProgressOffers(opts?: { offset?: number; limit?: number }) {
  const { inArray } = await import("drizzle-orm");
  return _getOffers({ ...opts, where: (t: any) => inArray(t.status, IN_PROGRESS_STATUSES) });
}

export async function listClosedWonOffers(opts?: { offset?: number; limit?: number }) {
  const { inArray } = await import("drizzle-orm");
  return _getOffers({ ...opts, where: (t: any) => inArray(t.status, CLOSED_WON_STATUSES) });
}

export async function listClosedLostOffers(opts?: { offset?: number; limit?: number }) {
  const { inArray } = await import("drizzle-orm");
  return _getOffers({ ...opts, where: (t: any) => inArray(t.status, CLOSED_LOST_STATUSES) });
}

// Keep old exports for backwards compatibility during migration
export const listActiveOffers = listInProgressOffers;
export const listAcceptedOffers = listClosedWonOffers;
export const listDeclinedOffers = listClosedLostOffers;

export async function fetchOffer(id: string) {
  return _getOffer(id);
}

export async function fetchOfferDetail(id: string) {
  return _getOfferDetail(id);
}

async function addOffer(data: Record<string, unknown>) {
  return _createOffer(data);
}

export async function editOffer(id: string, data: Record<string, unknown>) {
  return _updateOffer(id, data);
}

async function removeOffer(id: string) {
  return _deleteOffer(id);
}

/**
 * Upload a past offer letter PDF, extract compensation structure via AI.
 */
export async function uploadOfferLetter(
  offerId: string,
  formData: FormData,
): Promise<{ data?: ExtractedOfferLetter; error?: string }> {
  try {
    const ctx = await getActionContext();
    const file = formData.get("file") as File | null;
    if (!file) return { error: "No file provided." };

    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storeFile(ctx.organizationId, "uploads", file.name, buffer);
    const extracted = await extractTextFromFile(stored.path);

    const prompt = offerLetterExtractorPromptWithContext({ text: extracted.text });
    const result = await generate({
      agent: offerLetterExtractorAgent,
      prompt,
      output: offerLetterExtractionSchema,
    });

    const fields = (result as any).object as z.infer<typeof offerLetterExtractionSchema>;

    const extractedData: ExtractedOfferLetter = {
      ...fields,
      rawText: extracted.text,
      sourceFileName: file.name,
      sourceFileUrl: stored.url,
    };

    await _updateOffer(offerId, { extractedOfferLetter: extractedData });

    return { data: extractedData };
  } catch (error) {
    console.error("[uploadOfferLetter] Error:", error);
    return { error: error instanceof Error ? error.message : "Extraction failed" };
  }
}

/**
 * Upload pay stub PDFs, extract earnings/deductions via AI.
 */
export async function uploadPayStubs(
  offerId: string,
  formData: FormData,
): Promise<{ data?: ExtractedPayStub[]; error?: string }> {
  try {
    const ctx = await getActionContext();
    const files = formData.getAll("files") as File[];
    if (!files.length) return { error: "No files provided." };

    const stubs: ExtractedPayStub[] = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const stored = await storeFile(ctx.organizationId, "uploads", file.name, buffer);
      const extracted = await extractTextFromFile(stored.path);

      const prompt = payStubExtractorPromptWithContext({ text: extracted.text });
      const result = await generate({
        agent: payStubExtractorAgent,
        prompt,
        output: payStubExtractionSchema,
      });

      const fields = (result as any).object as z.infer<typeof payStubExtractionSchema>;

      stubs.push({
        ...fields,
        rawText: extracted.text,
        sourceFileName: file.name,
        sourceFileUrl: stored.url,
      });
    }

    await _updateOffer(offerId, { extractedPayStubs: stubs });

    return { data: stubs };
  } catch (error) {
    console.error("[uploadPayStubs] Error:", error);
    return { error: error instanceof Error ? error.message : "Extraction failed" };
  }
}

/**
 * Manually trigger offer recommendation generation.
 */
export async function generateOfferManual(offerId: string): Promise<{ success?: boolean; error?: string }> {
  try {
    const ctx = await getActionContext();
    const result = await offerGenerateRecommendation({
      organizationId: ctx.organizationId,
      entityId: offerId,
    });
    return { success: true };
  } catch (error) {
    console.error("[generateOfferManual] Error:", error);
    return { error: error instanceof Error ? error.message : "Generation failed" };
  }
}

/**
 * Send offer notification email to the candidate.
 */
async function sendOfferEmail(
  userId: string,
  candidateEmail: string,
  candidateName: string,
  roleTitle: string,
  compBase?: string | null,
): Promise<void> {
  const html = await render(
    OfferLetterEmail({ candidateName, roleTitle, compBase })
  );

  const sent = await sendEmailViaProvider(userId, {
    to: candidateEmail,
    subject: `Offer Letter: ${roleTitle}`,
    html,
  });

  if (!sent) {
    console.warn("[sendOfferEmail] No email provider connected for user:", userId);
    throw new Error("No email provider connected. Please connect your email in Settings > Integrations.");
  }
}

/**
 * Send an offer — sets status to "sent", timestamps it, and emails the candidate.
 * Single entry-point for all "send offer" flows (initial send, resend after revision, etc.)
 */
export async function sendOffer(
  offerId: string,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const ctx = await getActionContext();

    await _updateOffer(offerId, { status: "sent", sentAt: new Date() });

    const offer = await _getOfferDetail(offerId);
    if (offer?.application?.candidate?.email) {
      const candidate = offer.application.candidate;
      const roleTitle = offer.application.role?.title ?? "Position";
      await sendOfferEmail(
        ctx.userId,
        candidate.email,
        candidate.name ?? "Candidate",
        roleTitle,
        offer.compBase,
      );
    }

    return { success: true };
  } catch (error) {
    console.error("[sendOffer] Error:", error);
    return { error: error instanceof Error ? error.message : "Failed to send offer" };
  }
}

/**
 * Revise an offer — creates a new version with triggerType "recruiter_adjust", then sends it.
 */
export async function reviseOffer(
  offerId: string,
  data: { compState: OfferCompState; justification?: string },
): Promise<{ success?: boolean; versionNumber?: number; error?: string }> {
  try {
    const ctx = await getActionContext();
    const version = await createOfferVersion(offerId, ctx.organizationId, {
      triggerType: "recruiter_adjust",
      compState: data.compState,
      justification: data.justification,
      createdBy: ctx.user.name ?? ctx.userId,
      createdById: ctx.userId,
    });

    const sendResult = await sendOffer(offerId);
    if (sendResult.error) return { error: sendResult.error };

    return { success: true, versionNumber: version.versionNumber };
  } catch (error) {
    console.error("[reviseOffer] Error:", error);
    return { error: error instanceof Error ? error.message : "Revision failed" };
  }
}

/**
 * Withdraw an offer — only allowed when status is "sent" or "negotiating".
 * Sets status to "withdrawn", records reason, and notifies the candidate.
 */
export async function withdrawOffer(
  offerId: string,
  reason: OfferWithdrawReason,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const ctx = await getActionContext();

    // Verify offer is in a withdrawable state
    const offer = await _getOfferDetail(offerId);
    if (!offer) return { error: "Offer not found" };
    if (offer.status !== "sent" && offer.status !== "negotiating") {
      return { error: "Only sent or negotiating offers can be withdrawn" };
    }

    await _updateOffer(offerId, {
      status: "withdrawn",
      withdrawnAt: new Date(),
      withdrawReason: reason,
    });

    // Notify candidate
    if (offer.application?.candidate?.email) {
      const candidate = offer.application.candidate;
      const roleTitle = offer.application.role?.title ?? "Position";
      const html = await render(
        OfferWithdrawalEmail({
          candidateName: candidate.name ?? "Candidate",
          roleTitle,
        })
      );
      const sent = await sendEmailViaProvider(ctx.userId, {
        to: candidate.email,
        subject: `Offer Update: ${roleTitle}`,
        html,
      });
      if (!sent) {
        console.warn("[withdrawOffer] No email provider connected for user:", ctx.userId);
      }
    }

    return { success: true };
  } catch (error) {
    console.error("[withdrawOffer] Error:", error);
    return { error: error instanceof Error ? error.message : "Withdrawal failed" };
  }
}
