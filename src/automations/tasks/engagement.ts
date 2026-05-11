/**
 * engagements.send — Draft an outreach message and mark it sent.
 * engagements.check_response — Check engagement response status and update.
 */

import { db } from "@/db/client";
import { candidates, engagements, candidateIntelligence, engagementIntelligence } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { withExecutionLog } from "@/lib/execution-log";
import { engagementDrafterPromptWithContext } from "../agents/prompts/engagement-drafter";
import { engagementDrafterAgent, engagementDraftSchema } from "../agents/definitions/engagement-drafter";
import { generate } from "@/lib/ai";

async function upsertEngagementIntelligence(
  engagementId: string,
  organizationId: string,
  data: Partial<typeof engagementIntelligence.$inferInsert>,
) {
  const existing = await db.query.engagementIntelligence.findFirst({
    where: eq(engagementIntelligence.engagementId, engagementId),
  });

  if (existing) {
    await db
      .update(engagementIntelligence)
      .set({ ...data, evaluationCount: existing.evaluationCount + 1, lastEvaluatedAt: new Date(), updatedAt: new Date() })
      .where(eq(engagementIntelligence.id, existing.id));
    return { id: existing.id, action: "updated" as const };
  }

  const id = nanoid();
  await db.insert(engagementIntelligence).values({
    id,
    organizationId,
    engagementId,
    ...data,
  });
  return { id, action: "created" as const };
}

export async function engagementSend(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
}) {
  const { organizationId, entityId, traceId } = params;

  return withExecutionLog(db, {
    taskId: "engagement-send",
    organizationId,
    entityType: "engagement",
    entityId,
    traceId,
    actorId: engagementDrafterAgent.slug,
  }, async (log) => {
    const [msg] = await db
      .select()
      .from(engagements)
      .where(and(eq(engagements.id, entityId), eq(engagements.organizationId, organizationId)))
      .limit(1);
    if (!msg) return { skipped: true, reason: "engagement_not_found" };
    if (msg.status === "sent") return { skipped: true, reason: "already_sent" };

    const candidate = msg.recipientId
      ? await db.query.candidates.findFirst({ where: eq(candidates.id, msg.recipientId) })
      : null;
    if (!candidate) return { skipped: true, reason: "candidate_not_found" };

    // If no body/subject, draft using the agent
    if (!msg.body || !msg.subject) {
      // Read candidate profile from candidate_intelligence table
      const profileIntel = await db.query.candidateIntelligence.findFirst({
        where: eq(candidateIntelligence.candidateId, candidate.id),
      });
      const profileText = profileIntel?.profile
        ? JSON.stringify(profileIntel.profile, null, 2)
        : `Name: ${candidate.name}, Skills: ${(candidate.tags ?? []).join(", ")}`;

      const prompt = engagementDrafterPromptWithContext({
        candidateName: candidate.name,
        candidateProfile: profileText,
        engagementType: msg.type,
      });

      const result = await generate({ agent: engagementDrafterAgent, prompt, output: engagementDraftSchema });
      const draft = (result as any).object as typeof engagementDraftSchema._output;

      await db
        .update(engagements)
        .set({
          subject: draft.subject,
          body: draft.body,
          status: "sent",
          sentAt: new Date(),
          updatedAt: new Date(),
        } as any)
        .where(eq(engagements.id, entityId));

      // Write to engagement_intelligence table
      const intelRecord = await upsertEngagementIntelligence(entityId, organizationId, {
        draft: draft as any,
      });
      log.setOutput("engagement_intelligence", intelRecord.id, intelRecord.action);

      return { success: true, drafted: true, subject: draft.subject };
    }

    // Body already exists — just mark sent
    await db
      .update(engagements)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() } as any)
      .where(eq(engagements.id, entityId));

    return { success: true, drafted: false, subject: msg.subject };
  });
}

export async function engagementCheckResponse(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
}) {
  const { organizationId, entityId } = params;

  const [msg] = await db
    .select()
    .from(engagements)
    .where(and(eq(engagements.id, entityId), eq(engagements.organizationId, organizationId)))
    .limit(1);
  if (!msg) return { skipped: true, reason: "engagement_not_found" };
  if (msg.status !== "sent") return { skipped: true, reason: "not_sent" };

  // Check staleness — if sent > 5 days ago with no response, flag
  if (msg.sentAt) {
    const daysSinceSent = (Date.now() - new Date(msg.sentAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceSent > 5) {
      return { success: true, responded: false, stale: true, daysSinceSent: Math.round(daysSinceSent) };
    }
  }

  return { success: true, responded: false, stale: false };
}
