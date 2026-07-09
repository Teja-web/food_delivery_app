import { handleApi } from "@/lib/auth/api-key";
import { recordTestRun, listTestRuns } from "@/operations/work/test-runs";

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const body = await req.json();
    const row = await recordTestRun({
      ...body,
      projectId: body.projectId ?? ctx.projectId,
      ranAt: body.ranAt ? new Date(body.ranAt) : undefined,
    });
    return { id: row.id, status: row.status };
  });
}

export async function GET(req: Request) {
  return handleApi(req, async (ctx) => {
    const url = new URL(req.url);
    const items = await listTestRuns({
      projectId: url.searchParams.get("projectId") ?? ctx.projectId ?? undefined,
      projectTaskId: url.searchParams.get("projectTaskId") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 50),
    });
    return { items };
  });
}
