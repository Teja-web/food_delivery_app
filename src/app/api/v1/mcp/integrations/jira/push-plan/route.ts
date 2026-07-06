import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { projectTasks } from "@/db/schema/plan/project-task";
import { handleApi } from "@/lib/auth/api-key";
import { httpError } from "@/lib/auth/scope";
import { pushPlanToJira } from "@/lib/integrations/outbound";
import { getOutboundBinding } from "@/operations/choreography/adapter-bindings";

const bodySchema = z.object({
  planId: z.string().min(1),
});

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      throw httpError(400, "Invalid body", parsed.error.issues);
    }

    const plan = await db.query.projectTasks.findFirst({
      where: and(
        eq(projectTasks.id, parsed.data.planId),
        eq(projectTasks.organizationId, ctx.organizationId),
      ),
      columns: { id: true, projectId: true },
    });
    if (!plan) throw httpError(404, "Plan not found");
    if (ctx.projectId && ctx.projectId !== plan.projectId) {
      throw httpError(403, "API key scoped to a different project.");
    }
    const binding = await getOutboundBinding(ctx.organizationId, plan.projectId, "jira");
    if (!binding) {
      throw httpError(412, "No Jira binding configured for this project.");
    }

    const result = await pushPlanToJira(plan.id, { throwOnError: true });
    return result;
  });
}
