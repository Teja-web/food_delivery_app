/**
 * POST /api/v1/plans/:id/submit — move a plan_artifact draft → in_review
 * and materialize governance records for the transition. Replaces the
 * legacy `requestPlanApproval` op (approvals table is gone).
 */

import { handleApi } from "@/lib/auth/api-key";
import { planCrud } from "@/operations/plan/plans";
import { materializeGovernanceRecords } from "@/operations/governance/records";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleApi(req, async () => {
    const plan = await planCrud.get(id);
    if (!plan) {
      const err = new Error("Plan not found") as Error & { status?: number };
      err.status = 404;
      throw err;
    }
    if (plan.status !== "draft") {
      const err = new Error(
        `Plan is in status "${plan.status}", not "draft". Cannot resubmit.`,
      ) as Error & { status?: number };
      err.status = 409;
      throw err;
    }
    await planCrud.update(id, { status: "in_review" });
    const records = await materializeGovernanceRecords({
      planArtifactId: id,
      transitionFrom: "draft",
      transitionTo: "in_review",
    });

    let autoApproved = false;
    if (records.length === 0) {
      await planCrud.update(id, { status: "approved" });
      autoApproved = true;
    }

    return {
      plan: await planCrud.get(id),
      governanceRecords: records,
      autoApproved,
      note: autoApproved
        ? "No governance policy applied to this transition; plan auto-approved."
        : undefined,
    };
  });
}
