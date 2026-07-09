import { handleApi } from "@/lib/auth/api-key";
import { searchLearnings, type SearchMode } from "@/operations/knowledge-search";

export async function POST(req: Request) {
  return handleApi(req, async () => {
    const body = (await req.json().catch(() => ({}))) as {
      query?: string;
      projectId?: string;
      limit?: number;
      mode?: SearchMode;
    };
    if (!body.query) throw new Error("query is required");
    return searchLearnings({
      query: body.query,
      projectId: body.projectId,
      limit: body.limit,
      mode: body.mode,
    });
  });
}
