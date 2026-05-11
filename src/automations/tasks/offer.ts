/**
 * offer.create — Create an offer when application moves to offer stage.
 * offer.analyze_close — Run close risk analysis on an offer.
 * offer.analyze_leverage — Assess candidate negotiation leverage.
 * offer.resolve — Handle acceptance or decline cascade.
 * offer.generate_recommendation — Generate offer from extracted comp data.
 */

import { db } from "@/db/client";
import { offers, applications, candidates, roles, matches, offerIntelligence, entityNotes } from "@/db/schema";
import type { ExtractedOfferLetter, ExtractedPayStub, GeneratedOffer, OfferCompState, OfferRiskFlags } from "@/db/schema/offers";
import { eq, and, count, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { withExecutionLog } from "@/lib/execution-log";
import { offerCloseAnalyzerPromptWithContext } from "../agents/prompts/offer-close-analyzer";
import { offerCloseAnalyzerAgent, offerCloseAnalysisSchema } from "../agents/definitions/offer-close-analyzer";
import { offerLetterGeneratorAgent, generatedOfferSchema } from "../agents/definitions/offer-letter-generator";
import { offerLetterGeneratorPromptWithContext } from "../agents/prompts/offer-letter-generator";
import { offerLeverageAnalyzerAgent, offerLeverageAnalysisSchema } from "../agents/definitions/offer-leverage-analyzer";
import { offerLeverageAnalyzerPromptWithContext } from "../agents/prompts/offer-leverage-analyzer";
import { generate } from "@/lib/ai";
import { createOfferVersion } from "@/operations/offers";

/**
 * Create an offer record when an application moves to "offer" stage.
 * This ensures the offer appears on the offers page.
 */
export async function offerCreateFromApplication(params: {
  organizationId: string;
  entityId: string; // applicationId
  traceId?: string;
}) {
  const { organizationId, entityId } = params;

  // Check if application is in offer stage
  const application = await db.query.applications.findFirst({
    where: and(eq(applications.id, entityId), eq(applications.organizationId, organizationId)),
  });
  if (!application) return { skipped: true, reason: "application_not_found" };
  if (application.stage !== "offer") return { skipped: true, reason: "not_in_offer_stage" };

  // Check if offer already exists for this application
  const existingOffer = await db.query.offers.findFirst({
    where: and(eq(offers.applicationId, entityId), eq(offers.organizationId, organizationId)),
  });
  if (existingOffer) return { skipped: true, reason: "offer_already_exists", offerId: existingOffer.id };

  // Create new offer record
  const offerId = nanoid();
  await db.insert(offers).values({
    id: offerId,
    organizationId,
    applicationId: entityId,
    candidateId: application.candidateId,
    roleId: application.roleId,
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { success: true, offerId, action: "created" };
}

async function upsertOfferIntelligence(
  offerId: string,
  organizationId: string,
  data: Partial<typeof offerIntelligence.$inferInsert>,
) {
  const existing = await db.query.offerIntelligence.findFirst({
    where: eq(offerIntelligence.offerId, offerId),
  });

  if (existing) {
    await db
      .update(offerIntelligence)
      .set({ ...data, evaluationCount: sql`${offerIntelligence.evaluationCount} + 1`, lastEvaluatedAt: new Date(), updatedAt: new Date() })
      .where(eq(offerIntelligence.id, existing.id));
    return { id: existing.id, action: "updated" as const };
  }

  const id = nanoid();
  await db.insert(offerIntelligence).values({
    id,
    organizationId,
    offerId,
    ...data,
  });
  return { id, action: "created" as const };
}

export async function offerAnalyzeClose(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
}) {
  const { organizationId, entityId, traceId } = params;

  return withExecutionLog(db, {
    taskId: "offer-analyze-close",
    organizationId,
    entityType: "offer",
    entityId,
    traceId,
    actorId: offerCloseAnalyzerAgent.slug,
  }, async (log) => {
    const offer = await db.query.offers.findFirst({
      where: and(eq(offers.id, entityId), eq(offers.organizationId, organizationId)),
    });
    if (!offer) return { skipped: true, reason: "offer_not_found" };

    const entry = await db.query.applications.findFirst({
      where: eq(applications.id, offer.applicationId),
    });
    if (!entry) return { skipped: true, reason: "application_not_found" };

    const [role, candidate] = await Promise.all([
      db.query.roles.findFirst({ where: eq(roles.id, entry.roleId) }),
      db.query.candidates.findFirst({ where: eq(candidates.id, entry.candidateId) }),
    ]);
    if (!role || !candidate) return { skipped: true, reason: "role_or_candidate_not_found" };

    const compensation = offer.compensation as Record<string, unknown> | null;
    const offerDetails = [
      `Status: ${offer.status}`,
      `Compensation: ${compensation ? JSON.stringify(compensation) : "not set"}`,
      `Valid until: ${offer.validUntil ? offer.validUntil.toISOString().split("T")[0] : "no deadline"}`,
      `Document: ${offer.documentUrl ? "attached" : "not attached"}`,
    ].join("\n");

    const candidateContext = [
      `Location: ${candidate.location ?? "unknown"}`,
      `Source: ${candidate.source ?? "unknown"}`,
      `Current title: ${(candidate.profile as any)?.currentTitle ?? "unknown"}`,
    ].join("\n");

    const prompt = offerCloseAnalyzerPromptWithContext({
      candidateName: candidate.name,
      roleTitle: role.title,
      offerDetails,
      candidateContext,
    });

    const result = await generate({ agent: offerCloseAnalyzerAgent, prompt, output: offerCloseAnalysisSchema });
    const analysis = (result as any).object as typeof offerCloseAnalysisSchema._output;

    // Update offer with close analysis results
    await db
      .update(offers)
      .set({
        closeRisks: analysis.risks as any,
        checklist: analysis.checklist as any,
        closeOwnership: analysis.ownership as any,
        recommendation: analysis.recommendation,
        updatedAt: new Date(),
      })
      .where(eq(offers.id, entityId));

    // Write to offer_intelligence table
    const intelRecord = await upsertOfferIntelligence(entityId, organizationId, {
      closeAnalysis: analysis as any,
    });
    log.setOutput("offer_intelligence", intelRecord.id, intelRecord.action);

    return { success: true, riskScore: analysis.riskScore, recommendation: analysis.recommendation };
  });
}

export async function offerResolve(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
  data?: Record<string, unknown>;
}) {
  const { organizationId, entityId, traceId } = params;

  const offer = await db.query.offers.findFirst({
    where: and(eq(offers.id, entityId), eq(offers.organizationId, organizationId)),
  });
  if (!offer) return { skipped: true, reason: "offer_not_found" };

  // Derive outcome from the offer's current status (set by the update that triggered this rule)
  const outcome = offer.status as "accepted" | "declined";
  if (outcome !== "accepted" && outcome !== "declined") {
    return { skipped: true, reason: "unexpected_status", status: offer.status };
  }

  const entry = await db.query.applications.findFirst({
    where: eq(applications.id, offer.applicationId),
  });
  if (!entry) return { skipped: true, reason: "application_not_found" };

  const now = new Date();

  if (outcome === "accepted") {
    // Mark offer accepted
    await db
      .update(offers)
      .set({ status: "accepted", acceptedAt: now, updatedAt: now })
      .where(eq(offers.id, entityId));

    // Move pipeline entry to hired
    await db
      .update(applications)
      .set({ stage: "hired", updatedAt: now })
      .where(eq(applications.id, entry.id));

    // Reject other pipeline entries for same role that are still active
    const competing = await db.query.applications.findMany({
      where: and(
        eq(applications.roleId, entry.roleId),
        eq(applications.organizationId, organizationId),
      ),
    });
    const toReject = competing.filter(
      (p) => p.id !== entry.id && !["hired", "rejected", "withdrawn"].includes(p.stage),
    );

    for (const p of toReject) {
      await db
        .update(applications)
        .set({ stage: "rejected", updatedAt: now })
        .where(eq(applications.id, p.id));
    }

    return { success: true, outcome: "accepted", rejectedCount: toReject.length };
  } else {
    // Mark offer declined
    await db
      .update(offers)
      .set({ status: "declined", declinedAt: now, updatedAt: now })
      .where(eq(offers.id, entityId));

    // Move pipeline entry to withdrawn
    await db
      .update(applications)
      .set({ stage: "withdrawn", updatedAt: now })
      .where(eq(applications.id, entry.id));

    return { success: true, outcome: "declined" };
  }
}

/**
 * Generate an offer recommendation from extracted offer letter + pay stubs + role band.
 */
export async function offerGenerateRecommendation(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
}) {
  const { organizationId, entityId, traceId } = params;

  return withExecutionLog(db, {
    taskId: "offer-generate-recommendation",
    organizationId,
    entityType: "offer",
    entityId,
    traceId,
    actorId: offerLetterGeneratorAgent.slug,
  }, async (log) => {
    const offer = await db.query.offers.findFirst({
      where: and(eq(offers.id, entityId), eq(offers.organizationId, organizationId)),
    });
    if (!offer) return { skipped: true, reason: "offer_not_found" };

    const extractedOffer = offer.extractedOfferLetter as ExtractedOfferLetter | null;
    if (!extractedOffer) return { skipped: true, reason: "no_extracted_offer_letter" };

    const entry = await db.query.applications.findFirst({
      where: eq(applications.id, offer.applicationId),
    });
    if (!entry) return { skipped: true, reason: "application_not_found" };

    const [role, candidate] = await Promise.all([
      db.query.roles.findFirst({ where: eq(roles.id, entry.roleId) }),
      db.query.candidates.findFirst({ where: eq(candidates.id, entry.candidateId) }),
    ]);
    if (!role || !candidate) return { skipped: true, reason: "role_or_candidate_not_found" };

    // Build current comp summary
    const compLines = extractedOffer.components.map(
      (c) => `${c.name}: ${extractedOffer.currency ?? ""} ${c.amount.toLocaleString()}`
    );
    if (extractedOffer.variableBonus) {
      compLines.push(`Variable Bonus: ${extractedOffer.currency ?? ""} ${extractedOffer.variableBonus.toLocaleString()}`);
    }
    compLines.push(`Fixed CTC: ${extractedOffer.currency ?? ""} ${(extractedOffer.fixedCtc ?? 0).toLocaleString()}`);
    compLines.push(`Total CTC: ${extractedOffer.currency ?? ""} ${(extractedOffer.totalCtc ?? 0).toLocaleString()}`);
    compLines.push(`Format: ${extractedOffer.format}`);
    if (extractedOffer.bandLevel) compLines.push(`Band/Level: ${extractedOffer.bandLevel}`);
    if (extractedOffer.designation) compLines.push(`Designation: ${extractedOffer.designation}`);

    // Build pay stub summary
    const payStubs = (offer.extractedPayStubs as ExtractedPayStub[] | null) ?? [];
    const payStubSummary = payStubs.length > 0
      ? payStubs.map((s) =>
          `${s.month ?? "Unknown month"}: Gross ${s.currency ?? ""} ${(s.grossEarnings ?? 0).toLocaleString()}, Net ${s.currency ?? ""} ${(s.netPay ?? 0).toLocaleString()}`
        ).join("\n")
      : "No pay stubs provided.";

    // Build role band
    const roleComp = role.compensation as Record<string, unknown> | null;
    const roleBand = roleComp
      ? `Min: ${(roleComp as any).min ?? "not set"}, Max: ${(roleComp as any).max ?? "not set"}, Currency: ${(roleComp as any).currency ?? "not set"}`
      : "Role compensation band not set.";

    // Candidate profile
    const profile = candidate.profile as Record<string, unknown> | null;
    const candidateProfile = [
      `Name: ${candidate.name}`,
      `Title: ${candidate.title ?? "unknown"}`,
      `Location: ${candidate.location ?? "unknown"}`,
      profile?.summary ? `Summary: ${profile.summary}` : null,
    ].filter(Boolean).join("\n");

    // Check for leverage analysis from intelligence
    const intel = await db.query.offerIntelligence.findFirst({
      where: eq(offerIntelligence.offerId, entityId),
    });
    const leverageData = intel?.leverageAnalysis as any;
    const leverageContext = leverageData
      ? [
          `Leverage Score: ${leverageData.leverageScore}/100`,
          `Strategy: ${leverageData.negotiationStrategy}`,
          `Close Probability: ${leverageData.closeProbability}%`,
          ...(leverageData.leverageFactors ?? []).map(
            (f: any) => `- ${f.factor} (${f.impact}): ${f.signal}`,
          ),
        ].join("\n")
      : undefined;

    const prompt = offerLetterGeneratorPromptWithContext({
      currentComp: compLines.join("\n"),
      payStubSummary,
      roleBand,
      candidateProfile,
      roleTitle: role.title,
      leverageContext,
    });

    const result = await generate({
      agent: offerLetterGeneratorAgent,
      prompt,
      output: generatedOfferSchema,
    });

    const generated = (result as any).object as typeof generatedOfferSchema._output;

    const generatedOffer: GeneratedOffer = {
      components: generated.components,
      totalFixed: generated.totalFixed,
      totalCtc: generated.totalCtc,
      bonus: generated.bonus,
      equity: generated.equity,
      currency: generated.currency,
      hike: { percentage: generated.hikePercentage, absolute: generated.hikeAbsolute },
      competitivePosition: generated.competitivePosition,
      negotiationRange: { floor: generated.negotiationFloor, ceiling: generated.negotiationCeiling },
      rationale: generated.rationale,
      generatedAt: new Date().toISOString(),
      bandCompliance: generated.bandCompliance,
      parityRisk: generated.parityRisk,
      guardrailWarnings: generated.guardrailWarnings,
    };

    // Update offer with generated recommendation
    await db
      .update(offers)
      .set({
        generatedOffer,
        compensation: {
          baseBand: `${generated.currency} ${generated.totalFixed.toLocaleString()}`,
          recommended: `${generated.currency} ${generated.totalCtc.toLocaleString()}`,
          equity: generated.equity ?? undefined,
          bonus: generated.bonus ? `${generated.currency} ${generated.bonus.toLocaleString()}` : undefined,
        },
        updatedAt: new Date(),
      })
      .where(eq(offers.id, entityId));

    // Create offer version (v1 or replace) as a decision event
    const compState: OfferCompState = {
      components: generated.components,
      totalFixed: generated.totalFixed,
      totalCtc: generated.totalCtc,
      bonus: generated.bonus,
      equity: generated.equity,
      currency: generated.currency,
      format: extractedOffer.format,
    };

    const riskFlags: OfferRiskFlags = {
      bandCompliance: generated.bandCompliance,
      parityRisk: generated.parityRisk,
      budgetImpact: `${generated.currency} ${generated.totalCtc.toLocaleString()} annual`,
    };

    await createOfferVersion(entityId, organizationId, {
      triggerType: "system_generated",
      compState,
      riskFlags,
      justification: generated.rationale,
      createdBy: "system",
    });

    // Write to offer_intelligence table
    const intelRecord = await upsertOfferIntelligence(entityId, organizationId, {
      offerGeneration: generated as any,
    });
    log.setOutput("offer_intelligence", intelRecord.id, intelRecord.action);

    return { success: true, totalCtc: generated.totalCtc, hikePercentage: generated.hikePercentage };
  });
}

/**
 * Analyze candidate leverage for negotiation strategy.
 * Runs on offer:insert alongside close analysis.
 */
export async function offerAnalyzeLeverage(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
}) {
  const { organizationId, entityId, traceId } = params;

  return withExecutionLog(db, {
    taskId: "offer-analyze-leverage",
    organizationId,
    entityType: "offer",
    entityId,
    traceId,
    actorId: offerLeverageAnalyzerAgent.slug,
  }, async (log) => {
    const offer = await db.query.offers.findFirst({
      where: and(eq(offers.id, entityId), eq(offers.organizationId, organizationId)),
    });
    if (!offer) return { skipped: true, reason: "offer_not_found" };

    const entry = await db.query.applications.findFirst({
      where: eq(applications.id, offer.applicationId),
    });
    if (!entry) return { skipped: true, reason: "application_not_found" };

    const [role, candidate] = await Promise.all([
      db.query.roles.findFirst({ where: eq(roles.id, entry.roleId) }),
      db.query.candidates.findFirst({ where: eq(candidates.id, entry.candidateId) }),
    ]);
    if (!role || !candidate) return { skipped: true, reason: "role_or_candidate_not_found" };

    // Get match fitScore
    const match = await db.query.matches.findFirst({
      where: and(eq(matches.roleId, entry.roleId), eq(matches.candidateId, entry.candidateId)),
    });

    // Count active applications for this role (pipeline depth)
    const [pipelineCount] = await db
      .select({ count: count() })
      .from(applications)
      .where(and(
        eq(applications.roleId, entry.roleId),
        eq(applications.organizationId, organizationId),
      ));
    const pipelineDepth = Math.max(0, (pipelineCount?.count ?? 1) - 1); // exclude this candidate

    // Build context
    const profile = candidate.profile as Record<string, unknown> | null;
    const candidateContext = [
      `Name: ${candidate.name}`,
      `Title: ${candidate.title ?? "unknown"}`,
      `Location: ${candidate.location ?? "unknown"}`,
      `Source: ${candidate.source ?? "unknown"}`,
      profile?.summary ? `Summary: ${profile.summary}` : null,
    ].filter(Boolean).join("\n");

    const roleContext = [
      `Priority: ${(role as any).priority ?? "normal"}`,
      `Status: ${role.status}`,
      `Location: ${role.location ?? "unknown"}`,
      `Created: ${role.createdAt ? new Date(role.createdAt).toISOString().split("T")[0] : "unknown"}`,
    ].join("\n");

    // Pull candidate notes for competing offer context
    const candidateNotes = await db
      .select({ body: entityNotes.body })
      .from(entityNotes)
      .where(
        and(
          eq(entityNotes.entityType, "candidate"),
          eq(entityNotes.entityId, candidate.id),
          eq(entityNotes.organizationId, organizationId),
        )
      );
    const competingOffersContext = candidateNotes.length > 0
      ? candidateNotes.map(n => n.body).join("\n---\n")
      : "No confirmed competing offers.";

    const prompt = offerLeverageAnalyzerPromptWithContext({
      candidateName: candidate.name,
      roleTitle: role.title,
      fitScore: match?.fitScore ?? null,
      competingOffers: competingOffersContext,
      pipelineDepth,
      roleContext,
      candidateContext,
    });

    const result = await generate({
      agent: offerLeverageAnalyzerAgent,
      prompt,
      output: offerLeverageAnalysisSchema,
    });
    const analysis = (result as any).object as typeof offerLeverageAnalysisSchema._output;

    // Write to offer_intelligence table
    const intelRecord = await upsertOfferIntelligence(entityId, organizationId, {
      leverageAnalysis: analysis as any,
    });
    log.setOutput("offer_intelligence", intelRecord.id, intelRecord.action);

    return { success: true, leverageScore: analysis.leverageScore, strategy: analysis.negotiationStrategy };
  });
}
