import { handleApi } from "@/lib/api/auth";
import { requestPlanApproval } from "@/operations/approvals";

/** POST /api/v1/plans/:id/submit — request approval on a draft plan. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleApi(req, async () => {
    const body = await req.json().catch(() => ({}));
    return requestPlanApproval(id, body?.note);
  });
}
