import { handleApi } from "@/lib/auth/api-key";
import { upsertWorkItem } from "@/operations/work-items";

/**
 * POST /api/v1/work-items
 *
 * Upserts by (source, externalId). Use this from CI jobs or webhook
 * forwarders to mirror GitHub/Jira/ADO/Confluence artifacts.
 */
export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const body = await req.json();
    const id = await upsertWorkItem({ ...body, organizationId: ctx.organizationId });
    return { id };
  });
}
