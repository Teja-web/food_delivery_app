/**
 * MCP tool: set_project
 *
 * Bind the session to a project by id / slug / name. Fuzzy-matches via
 * `POST /api/v1/mcp/projects/resolve` within the API key's org. Once
 * bound, every subsequent tool call on the session reads from this
 * project's rules and governance state.
 */

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall, setSessionProject } from "../../session";

export const setProjectInput = z.object({
  project: z
    .string()
    .min(1)
    .describe("Project id, slug, or name to bind to this session. Fuzzy-matched."),
});

export type SetProjectInput = z.infer<typeof setProjectInput>;

interface ResolveResponse {
  project: { id: string; name: string; slug: string };
}

export async function runSetProject(client: CozntClient, input: SetProjectInput) {
  bumpToolCall();
  process.stderr.write(
    `[coznt-mcp] set_project: resolving query=${JSON.stringify(input.project)}\n`,
  );
  const result = await client.post<ResolveResponse>(
    "/api/v1/mcp/projects/resolve",
    { query: input.project },
  );
  setSessionProject(result.project);
  process.stderr.write(
    `[coznt-mcp] set_project: bound project=${result.project.slug} id=${result.project.id}\n`,
  );
  return {
    bound: true,
    project: result.project,
    note:
      `Session bound to "${result.project.name}" (slug: ${result.project.slug}). ` +
      "Subsequent verbs read from this project until you call `switch_project` or end the session.",
  };
}
