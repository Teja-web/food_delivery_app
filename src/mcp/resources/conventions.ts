/**
 * MCP resource: coznt://conventions
 *
 * The active rules for the current project, served as a passive resource
 * (cacheable, not a side-effecting tool call). The agent reads this on
 * session start to know what coznt will enforce.
 *
 * Borrowed shape from `@ai-sdlc/mcp-advisor`'s `conventions` resource.
 */

import { CozntClient } from "../client";

interface RuleListResponse {
  items: Array<{
    id: string;
    slug: string;
    title: string;
    body: string;
    severity: "info" | "warn" | "error";
    phase: string | null;
    tags: string[] | null;
  }>;
}

export async function readConventions(client: CozntClient) {
  const data = await client.get<RuleListResponse>("/api/v1/rules?limit=200");
  return {
    contents: [
      {
        uri: "coznt://conventions",
        mimeType: "application/json",
        text: JSON.stringify(
          {
            schema: "https://coznt.io/schemas/conventions.v1",
            rules: data.items.map((r) => ({
              slug: r.slug,
              title: r.title,
              severity: r.severity,
              phase: r.phase,
              tags: r.tags ?? [],
              body: r.body,
            })),
          },
          null,
          2,
        ),
      },
    ],
  };
}
