import { handleApi } from "@/lib/auth/api-key";
import type { SkillOutcomeVerdict } from "@/db/schema/skill/skill-outcome";
import { searchOutcomes } from "@/operations/knowledge-search";

export async function POST(req: Request) {
  return handleApi(req, async () => {
    const body = (await req.json().catch(() => ({}))) as {
      query?: string;
      projectId?: string;
      verdicts?: SkillOutcomeVerdict[];
      fromIso?: string;
      toIso?: string;
      limit?: number;
    };
    if (!body.query) throw new Error("query is required");
    const range =
      body.fromIso && body.toIso
        ? { from: new Date(body.fromIso), to: new Date(body.toIso) }
        : undefined;
    return searchOutcomes({
      query: body.query,
      projectId: body.projectId,
      verdicts: body.verdicts,
      range,
      limit: body.limit,
    });
  });
}
