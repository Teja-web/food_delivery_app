/**
 * MCP tool: switch_project
 *
 * Like `set_project` but explicitly for swapping mid-session. Omit
 * `project` to clear the binding and force the next call to re-bind via
 * the API key's pinned default (if any).
 */

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall, setSessionProject, getCurrentSession } from "../../session";

export const switchProjectInput = z.object({
  project: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Project id / slug / name to switch to. Omit to clear the current binding (next call rebinds from the API key default).",
    ),
});

export type SwitchProjectInput = z.infer<typeof switchProjectInput>;

interface ResolveResponse {
  project: { id: string; name: string; slug: string };
}

export async function runSwitchProject(client: CozntClient, input: SwitchProjectInput) {
  bumpToolCall();
  if (!input.project) {
    const session = getCurrentSession();
    const prior = session?.project?.slug ?? "<none>";
    if (session) session.project = null;
    process.stderr.write(
      `[coznt-mcp] switch_project: CLEARED prior=${prior}\n`,
    );
    return {
      bound: false,
      note: "Session project binding cleared. Next verb call will rebind from the API key default if one is configured.",
    };
  }
  process.stderr.write(
    `[coznt-mcp] switch_project: resolving query=${JSON.stringify(input.project)}\n`,
  );
  const result = await client.post<ResolveResponse>(
    "/api/v1/mcp/projects/resolve",
    { query: input.project },
  );
  setSessionProject(result.project);
  process.stderr.write(
    `[coznt-mcp] switch_project: bound project=${result.project.slug} id=${result.project.id}\n`,
  );
  return {
    bound: true,
    project: result.project,
    note: `Session switched to "${result.project.name}" (slug: ${result.project.slug}).`,
  };
}
