import { planCrud, createPlan } from "@/operations/plans";
import { handleApi } from "@/lib/auth/api-key";

export async function GET(req: Request) {
  return handleApi(req, async () => {
    const url = new URL(req.url);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 25));
    const q = url.searchParams.get("q");
    if (q) return planCrud.search(q, { offset, limit });
    return planCrud.list({ offset, limit, sortBy: "updatedAt", sortOrder: "desc" });
  });
}

export async function POST(req: Request) {
  return handleApi(req, async () => {
    const body = await req.json();
    return createPlan(body);
  });
}
