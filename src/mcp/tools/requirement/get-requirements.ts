/**
 * MCP tool: get_requirements
 *
 * Lists "requirement-like" plans for the session's bound project. Coznt
 * has no `requirement` plan kind — the closest equivalent is `story`,
 * which is the default. Pass `kind` to list other plan types (epic,
 * feature, adr, test_plan, release_plan, incident).
 *
 * Ported from SDLC's get_requirements. SDLC's schema uses a dedicated
 * `Requirement` model; coznt unifies everything under `plans` with a
 * `kind` discriminator.
 */

import { z } from "zod";

import { CozntClient } from "../../client.js";
import { bumpToolCall, getSessionProject } from "../../session.js";

export const getRequirementsInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
  kind: z
    .enum(["epic", "feature", "story", "adr", "test_plan", "release_plan", "incident"])
    .optional()
    .describe("Plan kind to list. Defaults to `story` (the closest analog to a requirement)."),
  status: z
    .enum([
      "draft",
      "in_review",
      "approved",
      "in_progress",
      "completed",
      "rejected",
      "cancelled",
    ])
    .optional()
    .describe("Optional status filter."),
  limit: z.number().int().min(1).max(200).optional().describe("Default 50, max 200."),
});

export type GetRequirementsInput = z.infer<typeof getRequirementsInput>;

export async function runGetRequirements(client: CozntClient, input: GetRequirementsInput) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (!projectId) {
    throw new Error("No active project. API key resolution failed — verify COZNT_API_KEY is valid, or pass `projectId` explicitly.");
  }
  const params = new URLSearchParams();
  if (input.kind) params.set("kind", input.kind);
  if (input.status) params.set("status", input.status);
  if (input.limit) params.set("limit", String(input.limit));
  const qs = params.toString();
  return client.get<unknown>(
    `/api/v1/mcp/projects/${encodeURIComponent(projectId)}/requirements${qs ? `?${qs}` : ""}`,
  );
}
