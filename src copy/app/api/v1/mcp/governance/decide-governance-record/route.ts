/**
 * POST /api/v1/mcp/governance/decide-governance-record
 *
 * Apply a terminal decision (passed / failed / skipped / expired) to a
 * governance_record. Backs the `decide_governance_record` MCP verb.
 */

import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { governanceRecords, GOVERNANCE_RECORD_STATUSES } from "@/db/schema/governance/records";
import { handleApi } from "@/lib/auth/api-key";
import { httpError } from "@/lib/auth/scope";
import { decideGovernanceRecord } from "@/operations/governance/records";

const bodySchema = z.object({
  id: z.string().min(1),
  decision: z
    .enum(GOVERNANCE_RECORD_STATUSES)
    .refine((s) => s !== "pending", { message: "decision must be terminal" }),
  note: z.string().optional(),
  detailsPatch: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      throw httpError(400, "Invalid body", parsed.error.issues);
    }

    const existing = await db.query.governanceRecords.findFirst({
      where: and(
        eq(governanceRecords.id, parsed.data.id),
        eq(governanceRecords.organizationId, ctx.organizationId),
      ),
    });
    if (!existing) throw httpError(404, "governance_record not found");
    if (ctx.projectId && ctx.projectId !== existing.projectId) {
      throw httpError(403, "API key scoped to a different project.");
    }

    await decideGovernanceRecord({
      id: parsed.data.id,
      status: parsed.data.decision,
      decisionNote: parsed.data.note,
      detailsPatch: parsed.data.detailsPatch,
    });
    return { id: parsed.data.id, status: parsed.data.decision };
  });
}
