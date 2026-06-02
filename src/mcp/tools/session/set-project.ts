/**
 * MCP tool: set_project
 *
 * Bind the session to a project by id / slug / name. Fuzzy-matches via
 * `POST /api/v1/mcp/projects/resolve` within the API key's org. Once
 * bound, every subsequent tool call on the session reads from this
 * project's phase, gates, and rules.
 */

import { z } from "zod";

import { CozntClient } from "../../client.js";
import { bumpToolCall, setSessionProject } from "../../session.js";
import { writeProjectPhaseCache } from "../../lib/cache-project-phase.js";

export const setProjectInput = z.object({
  project: z
    .string()
    .min(1)
    .describe("Project id, slug, or name to bind to this session. Fuzzy-matched."),
});

export type SetProjectInput = z.infer<typeof setProjectInput>;

interface ResolveResponse {
  project: { id: string; name: string; slug: string; phase: string };
}

export async function runSetProject(client: CozntClient, input: SetProjectInput) {
  bumpToolCall();
  const result = await client.post<ResolveResponse>(
    "/api/v1/mcp/projects/resolve",
    { query: input.project },
  );
  setSessionProject(result.project);
  try {
    await writeProjectPhaseCache(process.cwd(), result.project.phase);
  } catch {
    // ignore — phase cache is a convenience.
  }
  return {
    bound: true,
    project: result.project,
    note:
      `Session bound to "${result.project.name}" (slug: ${result.project.slug}, phase: ${result.project.phase}). ` +
      "Subsequent verbs read from this project until you call `switch_project` or end the session.",
  };
}
