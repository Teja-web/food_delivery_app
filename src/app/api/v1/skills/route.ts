import { handleApi } from "@/lib/api/auth";
import { listSkillsForProject, skillCrud } from "@/operations/skills";

export async function GET(req: Request) {
  return handleApi(req, async (ctx) => {
    if (ctx.projectId) {
      return { items: await listSkillsForProject(ctx.projectId) };
    }
    const url = new URL(req.url);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 25));
    return skillCrud.list({ offset, limit, sortBy: "createdAt", sortOrder: "desc" });
  });
}
