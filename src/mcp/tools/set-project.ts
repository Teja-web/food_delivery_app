/**
 * MCP tool: set_project
 *
 * Binds a project to the agent's MCP session. After this call, every
 * subsequent tool resolves its project from the session — the agent
 * doesn't have to pass `projectId` repeatedly.
 *
 * Fuzzy-matches the input against id / slug / name. If multiple
 * projects match (ambiguous) or none do, the server returns 409 / 404
 * with the candidate list so the agent can ask the user to pick.
 *
 * Ported from `/Users/ram/Projects/SDLC/apps/mcp-server/src/tools/project-context.ts`'s
 * `set_project`. Coznt's variant doesn't re-render the full context inline
 * (call `get_my_context` for that); it just confirms the binding.
 */

import { z } from "zod";

import { CozntClient } from "../client.js";
import { bumpToolCall, setSessionProject } from "../session.js";

export const setProjectInput = z.object({
  project: z
    .string()
    .min(1)
    .describe(
      "Project id, slug, or name. Fuzzy match: tries exact id → exact slug → exact name → substring.",
    ),
});

export type SetProjectInput = z.infer<typeof setProjectInput>;

interface ResolvedProject {
  id: string;
  name: string;
  slug: string;
  phase: string;
}

export async function runSetProject(client: CozntClient, input: SetProjectInput) {
  bumpToolCall();
  const resolved = await client.post<ResolvedProject>("/api/v1/mcp/projects/resolve", {
    query: input.project,
  });
  setSessionProject(resolved);
  return {
    bound: { id: resolved.id, name: resolved.name, slug: resolved.slug, phase: resolved.phase },
    nextStep:
      "Call `get_my_context` for the full briefing (rules, skills, ADRs, phase discipline).",
  };
}
