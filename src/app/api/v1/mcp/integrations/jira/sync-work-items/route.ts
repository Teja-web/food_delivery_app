import { z } from "zod/v4";

import { getOutboundBinding } from "@/operations/choreography/adapter-bindings";
import {
  backfillJiraRepositoryUrl,
  syncJiraProjectWorkItems,
} from "@/operations/integration/jira-projects";
import { handleApi } from "@/lib/auth/api-key";
import { httpError, requireProjectScope } from "@/lib/auth/scope";
import { jiraProjectKeyFromExternalKey } from "@/lib/integrations/jira-keys";

const bodySchema = z.object({
  projectId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      throw httpError(400, "Invalid body", parsed.error.issues);
    }

    const projectId = parsed.data.projectId ?? ctx.projectId;
    if (!projectId) {
      throw httpError(400, "projectId is required for organization-scoped API keys.");
    }
    const project = await requireProjectScope(ctx, projectId);
    const binding = await getOutboundBinding(ctx.organizationId, project.id, "jira");
    if (!binding) {
      throw httpError(412, "No Jira binding configured for this project.");
    }
    const projectKey = jiraProjectKeyFromExternalKey(binding.externalKey);
    const url = await backfillJiraRepositoryUrl({
      organizationId: ctx.organizationId,
      projectId: project.id,
      projectKey,
    });

    const syncedIssues = await syncJiraProjectWorkItems({
      organizationId: ctx.organizationId,
      projectId: project.id,
      projectKey,
    });

    return {
      projectId: project.id,
      projectKey,
      url,
      syncedIssues,
    };
  });
}
