import { projectCrud } from "@/operations/projects";
import { handleApi } from "@/lib/auth/api-key";

export async function GET(req: Request) {
  return handleApi(req, async () => {
    const url = new URL(req.url);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 25));
    const q = url.searchParams.get("q");
    if (q) return projectCrud.search(q, { offset, limit });
    return projectCrud.list({ offset, limit, sortBy: "createdAt", sortOrder: "desc" });
  });
}

export async function POST(req: Request) {
  return handleApi(req, async () => {
    const body = await req.json();
    return projectCrud.create(body);
  });
}
