import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall } from "../../session";

export const pushPlanToJiraInput = z.object({
  planId: z.string().min(1).describe("The Coznt project_task id to push into Jira."),
});

export type PushPlanToJiraInput = z.infer<typeof pushPlanToJiraInput>;

export async function runPushPlanToJira(
  client: CozntClient,
  input: PushPlanToJiraInput,
) {
  bumpToolCall();
  return client.post<unknown>("/api/v1/mcp/integrations/jira/push-plan", input);
}
