/**
 * POST /api/v1/mcp/projects/[id]/submit-phase-for-review
 *
 * For each `approval`-type phase_gate in the project's CURRENT phase
 * that is still pending or failed, ensure an open approval row exists.
 * Existing pending approvals are returned as-is (idempotent).
 *
 * Non-approval gates (coverage / lint / security / custom) are listed
 * in the response but not actioned — those clear via their own
 * mechanism (CI signal, deterministic assessors, manual mark_gate_passed).
 *
 * Body: `{ note?: string }` — optional context attached to each
 * created approval row.
 */

import { z } from "zod/v4";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { approvals } from "@/db/schema/plan/approval";
import { phaseGates } from "@/db/schema/phase-gate";
import { handleApi } from "@/lib/auth/api-key";
import { httpError, requireProjectScope } from "@/lib/auth/scope";
import { computeNextAction } from "@/lib/agent-context/next-action";
import { approvalCrud } from "@/operations/approvals";

const bodySchema = z.object({
  note: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleApi(req, async (ctx) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      throw httpError(400, "Invalid body", parsed.error.issues);
    }

    const project = await requireProjectScope(ctx, id);

    const gates = await db.query.phaseGates.findMany({
      where: and(eq(phaseGates.projectId, project.id), eq(phaseGates.phase, project.phase)),
    });

    const needingApproval = gates.filter(
      (g) => g.type === "approval" && (g.status === "pending" || g.status === "failed"),
    );

    // Find any existing pending approvals for these gates so we don't dupe.
    const gateIds = needingApproval.map((g) => g.id);
    const existing = gateIds.length
      ? await db.query.approvals.findMany({
          where: and(
            eq(approvals.organizationId, ctx.organizationId),
            eq(approvals.entityType, "phase_gate"),
            inArray(approvals.entityId, gateIds),
            eq(approvals.status, "pending"),
          ),
        })
      : [];
    const existingGateIds = new Set(existing.map((a) => a.entityId));

    const requesterName = `mcp:${ctx.apiKeyId.slice(0, 8)}`;
    const created: Array<{ id: string; gateId: string; gateName: string }> = [];

    for (const gate of needingApproval) {
      if (existingGateIds.has(gate.id)) continue;
      const approval = await approvalCrud.create({
        entityType: "phase_gate",
        entityId: gate.id,
        // We already know the project here — skip the lookup round-trip.
        projectId: project.id,
        phase: project.phase,
        requestedById: `api:${ctx.apiKeyId}`,
        requestedByName: requesterName,
        requesterNote: parsed.data.note,
      });
      created.push({ id: approval.id, gateId: gate.id, gateName: gate.name });
    }

    const nextAction = await computeNextAction(ctx.organizationId, project.id);

    return {
      project: { id: project.id, phase: project.phase },
      gates: {
        total: gates.length,
        approvalType: needingApproval.length,
        alreadyOpen: existing.length,
        createdNow: created.length,
        nonApprovalPending: gates.filter(
          (g) =>
            g.type !== "approval" && (g.status === "pending" || g.status === "failed"),
        ).map((g) => ({ name: g.name, type: g.type, status: g.status })),
      },
      created,
      existingApprovals: existing.map((a) => ({ id: a.id, gateId: a.entityId })),
      // Replaces the prior ad-hoc `nextStep` string. nextAction is the
      // canonical post-mutation guidance — choreography-driven, project-
      // state-aware, never over-claims. Null when no routing rule fires.
      nextAction,
    };
  });
}
