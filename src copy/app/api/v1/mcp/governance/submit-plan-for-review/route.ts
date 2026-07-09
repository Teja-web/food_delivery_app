/**
 * POST /api/v1/mcp/governance/submit-plan-for-review
 *
 * Move a project_task draft → in_review and materialize the governance
 * records that gate the transition. Backs the `submit_plan_for_review`
 * MCP verb.
 */

import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { projectTasks } from "@/db/schema/plan/project-task";
import { handleApi } from "@/lib/auth/api-key";
import { httpError } from "@/lib/auth/scope";
import { transitionJiraIssueForPlan } from "@/lib/integrations/outbound";
import { planCrud } from "@/operations/plan/plans";
import { materializeGovernanceRecords } from "@/operations/governance/records";

const bodySchema = z.object({
  projectTaskId: z.string().min(1),
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
    if (plan.status !== "draft") {
      throw httpError(409, `Plan is "${plan.status}", not "draft".`);
    }

    await planCrud.update(plan.id, { status: "in_review" });
    const records = await materializeGovernanceRecords({
      projectTaskId: plan.id,
      transitionFrom: "draft",
      transitionTo: "in_review",
    });

    // No-policy fallback: when zero records materialized, no governance
    // applies to this transition. Skip the review wait and transition
    // directly to `approved`. The plan_revisions trail still shows
    // draft → in_review → approved so the auto-approve is auditable.
    let autoApproved = false;
    if (records.length === 0) {
      await planCrud.update(plan.id, {
        status: "approved",
      });
      await transitionJiraIssueForPlan(plan.id, "approved");
      autoApproved = true;
    }

    const updated = await planCrud.get(plan.id);
    return {
      plan: updated,
      governanceRecords: records,
      autoApproved,
      note: autoApproved
        ? "No governance policy applied to this transition; plan auto-approved."
        : undefined,
    };
  });
}
