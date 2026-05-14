/**
 * MCP resource: coznt://my-tasks
 *
 * Work items + open plans visible to the API key's project scope. The
 * agent reads this to answer "what should I be working on?".
 *
 * Borrowed shape from `@ai-sdlc/mcp-advisor`'s `my-tasks` resource.
 */

import { CozntClient } from "../client.js";

interface WorkItemListResponse {
  items: Array<{
    id: string;
    title: string;
    status: string;
    priority: string | null;
    assigneeName: string | null;
    externalRef: string | null;
  }>;
}

interface PlanListResponse {
  items: Array<{
    id: string;
    title: string;
    kind: string;
    status: string;
    priority: string | null;
    assigneeName: string | null;
  }>;
}

export async function readMyTasks(client: CozntClient) {
  const [items, plans] = await Promise.all([
    client.get<WorkItemListResponse>("/api/v1/work-items?limit=20"),
    client.get<PlanListResponse>("/api/v1/plans?limit=20"),
  ]);
  return {
    contents: [
      {
        uri: "coznt://my-tasks",
        mimeType: "application/json",
        text: JSON.stringify(
          {
            schema: "https://coznt.io/schemas/my-tasks.v1",
            workItems: items.items.map((i) => ({
              id: i.id,
              title: i.title,
              status: i.status,
              priority: i.priority,
              assigneeName: i.assigneeName,
              externalRef: i.externalRef,
            })),
            plans: plans.items.map((p) => ({
              id: p.id,
              title: p.title,
              kind: p.kind,
              status: p.status,
              priority: p.priority,
              assigneeName: p.assigneeName,
            })),
          },
          null,
          2,
        ),
      },
    ],
  };
}
