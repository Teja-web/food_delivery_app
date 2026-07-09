/**
 * MCP tool: get_my_context
 *
 * Returns project + rules + skills the caller can invoke + recent ADRs. This
 * is the agent's orientation call — typically the first tool fired in a
 * session.
 *
 * Borrowed shape from `@ai-sdlc/mcp-advisor`'s `get-context` tool. Wraps
 * coznt's existing `/api/v1/mcp/context` endpoint and decorates the response
 * with a local `staleness` block — if the CLI / MCP / prompt-hook installed
 * in this checkout has drifted from the server's current artifact versions,
 * we tell the agent to nudge the user to run `coznt sync`. Posture file
 * instructs the agent to surface `staleness.message` verbatim.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall } from "../../session";

export const getMyContextInput = z.object({
  repoUrl: z.string().optional().describe(
    "Optional repo URL hint (e.g. https://github.com/org/repo) so coznt can disambiguate which project this session is for when the API key is org-scoped.",
  ),
  workItemKey: z.string().optional().describe(
    "Optional work item key (e.g. JIRA ticket id) the agent thinks it's working on.",
  ),
});

export type GetMyContextInput = z.infer<typeof getMyContextInput>;

type ArtifactSlug = "coznt-mcp" | "coznt-prompt-hook";

interface StalenessReason {
  component: ArtifactSlug;
  local: string;
  latest: string;
}

interface Staleness {
  shouldSync: boolean;
  reasons: StalenessReason[];
  message: string | null;
}

type ContextShape = {
  project?: unknown;
  welcome?: unknown;
  currentStage?: unknown;
};

function isRequirementsOrDesignStage(currentStage: unknown): boolean {
  if (typeof currentStage !== "string") return false;
  const emphasized = currentStage.match(/\*([^*]+)\*\s*phase/i)?.[1]?.trim().toLowerCase();
  if (emphasized) {
    return emphasized === "requirements" || emphasized === "design";
  }
  const normalized = currentStage.toLowerCase();
  return (
    normalized.includes("in the requirements phase") ||
    normalized.includes("in the design phase")
  );
}

function serializeGetMyContextResponse(
  body: unknown,
  staleness: Staleness | null,
): unknown {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return body;
  }

  const typed = body as ContextShape & Record<string, unknown>;
  if (isRequirementsOrDesignStage(typed.currentStage)) {
    return {
      project: typed.project ?? null,
      welcome: typed.welcome ?? null,
      currentStage: typed.currentStage ?? null,
    };
  }

  if (staleness) {
    return { ...typed, staleness };
  }
  return typed;
}

/**
 * Minimal `.coznt/config.json` reader. Intentionally re-implemented here
 * rather than imported from `src/cli/lib/config.ts` so the MCP bundle stays
 * self-contained (the CLI helpers aren't in the mcp tsconfig include set,
 * and pulling them in would inflate the npx-distributed tarball). Returns
 * only the fields staleness needs; ignores everything else.
 */
function readLocalConfig(): { serverUrl: string; mcpVersion: string | null; hookVersion: string | null } | null {
  try {
    const raw = readFileSync(join(process.cwd(), ".coznt", "config.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const serverUrl = typeof parsed.serverUrl === "string" ? parsed.serverUrl.replace(/\/$/, "") : null;
    if (!serverUrl) return null;
    const mcp = (parsed.mcp ?? null) as Record<string, unknown> | null;
    const promptHook = (parsed.promptHook ?? null) as Record<string, unknown> | null;
    return {
      serverUrl,
      mcpVersion: mcp && typeof mcp.version === "string" ? mcp.version : null,
      hookVersion: promptHook && typeof promptHook.version === "string" ? promptHook.version : null,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve the current published version of `<slug>` by following the
 * server's `/install/<slug>/latest` redirect. Mirrors the CLI's
 * `fetchCurrentArtifactVersion`. Returns null on any failure — staleness
 * is a soft signal, never fatal to the get_my_context call.
 */
async function fetchLatestVersion(serverUrl: string, slug: ArtifactSlug): Promise<string | null> {
  try {
    const res = await fetch(`${serverUrl}/install/${slug}/latest`, { redirect: "manual" });
    const location = res.headers.get("location");
    if (!location) return null;
    const match = location.match(new RegExp(`${slug}-(.+)\\.tgz$`));
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

async function computeStaleness(): Promise<Staleness | null> {
  const cfg = readLocalConfig();
  if (!cfg) return null;

  const [latestMcp, latestHook] = await Promise.all([
    fetchLatestVersion(cfg.serverUrl, "coznt-mcp"),
    fetchLatestVersion(cfg.serverUrl, "coznt-prompt-hook"),
  ]);

  const reasons: StalenessReason[] = [];
  const drift = (component: ArtifactSlug, local: string | null, latest: string | null) => {
    if (local && latest && local !== latest) {
      reasons.push({ component, local, latest });
    }
  };
  drift("coznt-mcp", cfg.mcpVersion, latestMcp);
  drift("coznt-prompt-hook", cfg.hookVersion, latestHook);

  const shouldSync = reasons.length > 0;
  const message = shouldSync
    ? `Coznt artifacts have drifted (${reasons.map((r) => `${r.component} ${r.local} → ${r.latest}`).join("; ")}). Ask the user to run \`coznt sync\` to refresh posture and choreography.`
    : null;

  return { shouldSync, reasons, message };
}

export async function runGetMyContext(client: CozntClient, input: GetMyContextInput) {
  bumpToolCall();
  const params = new URLSearchParams();
  if (input.repoUrl) params.set("repoUrl", input.repoUrl);
  if (input.workItemKey) params.set("workItemKey", input.workItemKey);
  const qs = params.toString();
  const path = `/api/v1/mcp/context${qs ? `?${qs}` : ""}`;

  const bodyPromise = client.get<unknown>(path);
  const stalenessPromise = computeStaleness().catch(() => null);
  const body = await bodyPromise;
  const staleness = await stalenessPromise;
  return serializeGetMyContextResponse(body, staleness);
}
