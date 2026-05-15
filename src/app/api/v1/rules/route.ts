import { handleApi } from "@/lib/auth/api-key";
import { listRulesForProject } from "@/operations/rules";
import { ruleCrud } from "@/operations/rules";

export async function GET(req: Request) {
  return handleApi(req, async (ctx) => {
    const url = new URL(req.url);
    const phase = url.searchParams.get("phase") ?? undefined;
    if (ctx.projectId) {
      return { items: await listRulesForProject(ctx.projectId, phase) };
    }
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 25));
    return ruleCrud.list({ offset, limit, sortBy: "createdAt", sortOrder: "desc" });
  });
}
