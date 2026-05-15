import { handleApi } from "@/lib/auth/api-key";
import { recordDeployment, listDeployments } from "@/operations/deployments";

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const body = await req.json();
    const row = await recordDeployment({
      ...body,
      projectId: body.projectId ?? ctx.projectId,
      startedAt: body.startedAt ? new Date(body.startedAt) : undefined,
      completedAt: body.completedAt ? new Date(body.completedAt) : undefined,
      rolledBackAt: body.rolledBackAt ? new Date(body.rolledBackAt) : undefined,
    });
    return { id: row.id, status: row.status };
  });
}

export async function GET(req: Request) {
  return handleApi(req, async (ctx) => {
    const url = new URL(req.url);
    const items = await listDeployments({
      projectId: url.searchParams.get("projectId") ?? ctx.projectId ?? undefined,
      environment: url.searchParams.get("environment") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 50),
    });
    return { items };
  });
}
