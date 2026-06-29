import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall, getSessionProject } from "../../session";

export const syncJiraWorkItemsInput = z.object({
  projectId: z
    .string()
    .min(1)
    .optional()
    .describe("Defaults to the session's bound project."),
});

export type SyncJiraWorkItemsInput = z.infer<typeof syncJiraWorkItemsInput>;

export async function runSyncJiraWorkItems(
  client: CozntClient,
  input: SyncJiraWorkItemsInput,
) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  return client.post<unknown>("/api/v1/mcp/integrations/jira/sync-work-items", {
    projectId,
  });
}
