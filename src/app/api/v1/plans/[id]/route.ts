import { planCrud, appendPlanRevision } from "@/operations/plan/plans";
import { handleApi } from "@/lib/auth/api-key";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleApi(req, async () => {
    const plan = await planCrud.get(id);
    if (!plan) {
      const err = new Error("Plan not found") as Error & { status?: number };
      err.status = 404;
      throw err;
    }
    return plan;
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleApi(req, async () => {
    const body = await req.json();
    if (typeof body?.body === "string") {
      await appendPlanRevision({
        projectTaskId: id,
        body: body.body,
        metadata: body.metadata,
        changeNote: body.changeNote,
      });
    }
    const { body: _ignore, changeNote: _cn, ...rest } = body ?? {};
    if (Object.keys(rest).length > 0) {
      await planCrud.update(id, rest);
    }
    return planCrud.get(id);
  });
}
