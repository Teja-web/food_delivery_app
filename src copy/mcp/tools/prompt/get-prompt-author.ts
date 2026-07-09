/**
 * MCP tool: get_prompt_author
 *
 * Resolve the local developer's identity for prompt attribution.
 * Pure-local — no platform call. Reads git config + OS user, respects
 * COZNT_PROMPT_AUTHOR / COZNT_PROMPT_AUTHOR_EMAIL env overrides.
 */

import { z } from "zod";

import { bumpToolCall } from "../../session";
import { resolveVibeAuthor, type VibeAuthor } from "../../lib/resolve-vibe-author";

export const getPromptAuthorInput = z.object({
  workspaceDir: z
    .string()
    .optional()
    .describe("Workspace directory. Defaults to the MCP client's CWD."),
});

export type GetPromptAuthorInput = z.infer<typeof getPromptAuthorInput>;

export async function runGetPromptAuthor(_unused: unknown, input: GetPromptAuthorInput): Promise<VibeAuthor> {
  bumpToolCall();
  return resolveVibeAuthor(input.workspaceDir ?? process.cwd());
}
