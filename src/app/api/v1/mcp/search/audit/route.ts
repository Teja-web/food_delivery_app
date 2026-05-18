import { handleApi } from "@/lib/auth/api-key";
import type { AuditActorType } from "@/db/schema/audit-log";
import { searchAudit } from "@/operations/knowledge-search";

export async function POST(req: Request) {
  return handleApi(req, async () => {
    const body = (await req.json().catch(() => ({}))) as {
      query?: string;
      actorType?: AuditActorType;
      fromIso?: string;
      toIso?: string;
      limit?: number;
    };
    if (!body.query) throw new Error("query is required");
    const range =
      body.fromIso && body.toIso
        ? { from: new Date(body.fromIso), to: new Date(body.toIso) }
        : undefined;
    return searchAudit({
      query: body.query,
      actorType: body.actorType,
      range,
      limit: body.limit,
    });
  });
}
