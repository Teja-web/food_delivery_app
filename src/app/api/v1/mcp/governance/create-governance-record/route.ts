/**
 * POST /api/v1/mcp/governance/create-governance-record
 *
 * Kind-parameterized creator. Backs the `create_governance_record` MCP verb.
 */

import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { projectTasks } from "@/db/schema/plan/project-task";
import { GOVERNANCE_KINDS } from "@/db/schema/governance/policies";
import { PLAN_STATUSES } from "@/db/schema/plan/plan-kinds";
import { handleApi } from "@/lib/auth/api-key";
import { httpError } from "@/lib/auth/scope";
import { governanceRecordCrud } from "@/operations/governance/records";

const bodySchema = z.object({
  projectTaskId: z.string().min(1),
  kind: z.enum(GOVERNANCE_KINDS),
  policyId: z.string().optional(),
  transitionFrom: z.enum(PLAN_STATUSES).optional(),
  transitionTo: z.enum(PLAN_STATUSES).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      throw httpError(400, "Invalid body", parsed.error.issues);
    }

    const plan = await db.query.projectTasks.findFirst({
      where: and(
        eq(projectTasks.id, parsed.data.projectTaskId),
        eq(projectTasks.organizationId, ctx.organizationId),
      ),
    });
    if (!plan) throw httpError(404, "Plan not found");
    if (ctx.projectId && ctx.projectId !== plan.projectId) {
      throw httpError(403, "API key scoped to a different project.");
    }

    const row = await governanceRecordCrud.create({
      projectId: plan.projectId,
      projectTaskId: plan.id,
      kind: parsed.data.kind,
      policyId: parsed.data.policyId ?? null,
      transitionFrom: parsed.data.transitionFrom ?? null,
      transitionTo: parsed.data.transitionTo ?? null,
      status: "pending",
      details: parsed.data.details,
    });
    return { record: row };
  });
}
