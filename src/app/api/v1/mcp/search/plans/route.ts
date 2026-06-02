import { handleApi } from "@/lib/auth/api-key";
import type { PlanKind, PlanStatus } from "@/db/schema/plan/plan";
import { searchPlans, type SearchMode } from "@/operations/knowledge-search";

export async function POST(req: Request) {
  return handleApi(req, async () => {
    const body = (await req.json().catch(() => ({}))) as {
      query?: string;
      projectId?: string;
      kinds?: PlanKind[];
      statuses?: PlanStatus[];
      limit?: number;
      mode?: SearchMode;
    };
    if (!body.query) throw new Error("query is required");
    return searchPlans({
      query: body.query,
      projectId: body.projectId,
      kinds: body.kinds,
      statuses: body.statuses,
      limit: body.limit,
      mode: body.mode,
    });
  });
}
