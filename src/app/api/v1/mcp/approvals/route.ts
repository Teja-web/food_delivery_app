/**
 * POST /api/v1/mcp/approvals — create an approval request.
 *
 * Thin wrapper that calls the existing approval CRUD with the API key
 * as requester. Reviewers see the row on /approvals; the daily approval
 * inbox moment (H3) handles the human-in-the-loop side.
 */

import { z } from "zod/v4";

import { APPROVAL_ENTITY_TYPES } from "@/db/schema/plan/approval";
import { handleApi } from "@/lib/auth/api-key";
import { computeNextAction } from "@/lib/agent-context/next-action";
import { createApprovalWithProjectResolution } from "@/operations/approvals";

const bodySchema = z.object({
  entityType: z.enum(APPROVAL_ENTITY_TYPES),
  entityId: z.string().min(1),
  note: z.string().optional(),
});

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const err = new Error("Invalid body") as Error & { status?: number; details?: unknown };
      err.status = 400;
      err.details = parsed.error.issues;
      throw err;
    }
    const requesterName = `mcp:${ctx.apiKeyId.slice(0, 8)}`;
    const approval = await createApprovalWithProjectResolution({
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      requestedById: `api:${ctx.apiKeyId}`,
      requestedByName: requesterName,
      requesterNote: parsed.data.note,
    });

    // nextAction is project-scoped. Approvals can be org-wide (null
    // projectId) — those get null.
    const projectId =
      ctx.projectId ??
      (approval as { projectId?: string | null }).projectId ??
      null;
    const nextAction = projectId
      ? await computeNextAction(ctx.organizationId, projectId)
      : null;

    return {
      id: approval.id,
      status: approval.status,
      requestedByName: requesterName,
      nextAction,
    };
  });
}
