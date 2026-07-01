/**
 * MCP resource: coznt://standards
 *
 * Exact effective org/project standards. Passive, cacheable reference
 * material for agents. Standards are not prompts and not skills; the body is
 * returned exactly as stored by coznt.
 */

import { CozntClient } from "../client";
import { getSessionProject } from "../session";

interface StandardsBundleResponse {
  requiredComplete: boolean;
  missingRequired: string[];
  standards: Array<{
    kind: string;
    slug: string;
    title: string;
    scope: "org" | "project";
    version: string;
    hash: string;
    content: string;
  }>;
}

export async function readStandards(client: CozntClient) {
  const project = getSessionProject();
  const data = await client.post<StandardsBundleResponse>("/api/v1/mcp/standards/sync", {
    ...(project?.id ? { projectId: project.id } : {}),
  });
  return {
    contents: [
      {
        uri: "coznt://standards",
        mimeType: "application/json",
        text: JSON.stringify(
          {
            schema: "https://coznt.io/schemas/standards.v1",
            requiredComplete: data.requiredComplete,
            missingRequired: data.missingRequired,
            standards: data.standards.map((standard) => ({
              kind: standard.kind,
              slug: standard.slug,
              title: standard.title,
              scope: standard.scope,
              version: standard.version,
              hash: standard.hash,
              body: standard.content,
            })),
          },
          null,
          2,
        ),
      },
    ],
  };
}
