import { handleApi } from "@/lib/api/auth";
import { approvalCrud } from "@/operations/approvals";

/** POST /api/v1/plans/:id/submit — request approval on a draft plan. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleApi(req, async (ctx) => {
    const body = await req.json().catch(() => ({}));
    return approvalCrud.create({
      planId: id,
      requestedById: `api:${ctx.apiKeyId}`,
      requesterNote: body?.note,
      approverIds: body?.approverIds,
    });
  });
}
