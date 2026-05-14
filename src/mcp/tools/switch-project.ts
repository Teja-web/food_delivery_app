/**
 * MCP tool: switch_project
 *
 * Re-binds the session to a different project, or clears the binding
 * entirely if `project` is omitted. Same fuzzy-match resolution as
 * `set_project`. Use this when the agent moves between projects mid-IDE
 * without restarting the MCP session.
 *
 * Ported from `/Users/ram/Projects/SDLC/apps/mcp-server/src/tools/project-context.ts`'s
 * `switch_project`.
 */

import { z } from "zod";

import { CozntClient } from "../client.js";
import { bumpToolCall, clearSessionProject, setSessionProject } from "../session.js";

export const switchProjectInput = z.object({
  project: z
    .string()
    .optional()
    .describe(
      "Project id, slug, or name (fuzzy match). Omit to clear the current binding so the agent can ask the user which project to work on next.",
    ),
});

export type SwitchProjectInput = z.infer<typeof switchProjectInput>;

interface ResolvedProject {
  id: string;
  name: string;
  slug: string;
  phase: string;
}

export async function runSwitchProject(client: CozntClient, input: SwitchProjectInput) {
  bumpToolCall();
  if (!input.project) {
    clearSessionProject();
    return { cleared: true, nextStep: "Ask the user which project to work on, then call `set_project`." };
  }
  const resolved = await client.post<ResolvedProject>("/api/v1/mcp/projects/resolve", {
    query: input.project,
  });
  setSessionProject(resolved);
  return {
    bound: { id: resolved.id, name: resolved.name, slug: resolved.slug, phase: resolved.phase },
    nextStep: "Call `get_my_context` for the new project's briefing.",
  };
}
