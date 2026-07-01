/**
 * Coznt MCP server.
 *
 * One server that learns from both:
 *   - `@ai-sdlc/mcp-advisor` — session/context bridge model (read-heavy,
 *     resources for cacheable context, lightweight tools for telemetry)
 *   - `@sdlc-platform/mcp-server` — agent-as-driver model (write tools
 *     for the points where coznt is the source of truth)
 *
 * What lands here is the synthesis the architecture review picked:
 *   - Resources: passive, MCP-native, for cacheable context
 *   - Context tools: read + session telemetry
 *   - Discipline writes: only where coznt is the system of record
 *
 * Excluded by design — coznt writes governance metadata (verdicts,
 * check-runs, approvals, ledger rows) but never the underlying work
 * product. The autonomy ledger is only credible if the grader is not
 * also the actor for the thing it grades.
 *
 *   - create-pr        — the agent/dev opens the PR; coznt grades it.
 *                        Posting check-runs back is allowed (governance
 *                        metadata about existing work), creating the PR
 *                        itself is not (that is the work product).
 *   - push-to-external — Jira / Confluence own their record. Reverse-sync
 *                        from coznt creates a drift problem with no clean
 *                        reconciliation; the inbound webhook is the only
 *                        sync direction.
 *   - setup-workspace  — the `coznt connect` CLI does this in the open,
 *                        with a diff the developer can see. A server-side
 *                        MCP verb would hide the side-effect inside a
 *                        tool call.
 *
 * Rule of thumb: if it changes a file on the dev's machine, a branch in
 * their repo, or a ticket in their tracker, it belongs to the agent/dev
 * surface. If it changes a verdict, an approval, or a ledger row, it
 * belongs here.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z, type ZodTypeAny } from "zod";

import { MCP_VERSION } from "../lib/agent-context/version";
import { CozntClient, CozntApiError, readConfig } from "./client";
import { getSessionProject, setSessionProject, type SessionProject } from "./session";
import { tools, RESOURCES } from "./registry";

const SERVER_NAME = "coznt-mcp";
const SERVER_VERSION = MCP_VERSION;

/**
 * Diagnostic stderr logger. stdout is reserved for the MCP JSON-RPC
 * protocol; stderr is what editors (Claude Code, Cursor, Codex) pipe to
 * the MCP server log. Prefix makes it greppable when investigating
 * "binding didn't persist" style reports from agents.
 */
function mcpLog(msg: string): void {
  process.stderr.write(`[coznt-mcp] ${msg}\n`);
}

function zodToJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  // Zod v4 ships a built-in JSON Schema emitter — no extra dep needed.
  return z.toJSONSchema(schema) as Record<string, unknown>;
}


export function createCozntMcpServer(): Server {
  const cfg = readConfig();
  const client = new CozntClient(cfg);
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.schema),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const found = tools.find((t) => t.name === req.params.name);
    if (!found) {
      return {
        content: [{ type: "text" as const, text: `Unknown tool: ${req.params.name}` }],
        isError: true,
      };
    }
    const parsed = found.schema.safeParse(req.params.arguments ?? {});
    if (!parsed.success) {
      return {
        content: [{ type: "text" as const, text: `Invalid input: ${parsed.error.message}` }],
        isError: true,
      };
    }
    // Verbs that legitimately operate without a bound project — drafts
    // (in-memory only), project-binding verbs themselves, and the
    // unbound-state orientation call. These skip the auto-bind so the
    // dispatcher doesn't fail when COZNT_URL is unreachable but the verb
    // doesn't need it.
    const PROJECT_OPTIONAL_VERBS = new Set([
      "set_project",
      "switch_project",
      "get_my_context",
      "draft_requirement",
      "list_draft_requirements",
      "update_draft_requirement",
      "delete_draft_requirement",
    ]);

    // Lazy session bind: every API key is project-pinned, so the first
    // tool call resolves the key's project and caches it in the session.
    // After that, getSessionProject() is populated for the lifetime of
    // the MCP process.
    if (!getSessionProject() && !PROJECT_OPTIONAL_VERBS.has(req.params.name)) {
      mcpLog(`autobind: attempting /api/v1/mcp/me for verb=${req.params.name}`);
      try {
        const { project } = await client.get<{ project: SessionProject }>("/api/v1/mcp/me");
        setSessionProject(project);
        mcpLog(`autobind: ok project=${project.slug} id=${project.id}`);
      } catch (err) {
        const msg =
          err instanceof CozntApiError
            ? `${err.message} (status ${err.status})`
            : err instanceof Error
              ? err.message
              : "unknown error";
        mcpLog(`autobind: FAIL verb=${req.params.name} err=${msg}`);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to resolve project from API key: ${msg}. Check that COZNT_API_KEY is valid and bound to a live project, or call \`set_project\` with an id/slug/name to bind one explicitly for this session.`,
            },
          ],
          isError: true,
        };
      }
    } else if (!PROJECT_OPTIONAL_VERBS.has(req.params.name)) {
      const bound = getSessionProject();
      mcpLog(`dispatch: verb=${req.params.name} bound=${bound?.slug ?? "<none>"}`);
    } else {
      mcpLog(`dispatch: verb=${req.params.name} (project-optional)`);
    }
    try {
      // The tools array is a union of differently-shaped inputs; the
      // narrowing via `.find(... .name)` doesn't carry through the union,
      // so we cast at the call site. Zod has already validated the input.
      const run = found.run as (c: CozntClient, i: unknown) => Promise<unknown>;
      const result = await run(client, parsed.data);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const msg =
        err instanceof CozntApiError
          ? `${err.message} (status ${err.status}${err.details ? `, details: ${JSON.stringify(err.details)}` : ""})`
          : err instanceof Error
            ? err.message
            : "unknown error";
      mcpLog(`dispatch: ERROR verb=${req.params.name} err=${msg}`);
      return {
        content: [{ type: "text" as const, text: msg }],
        isError: true,
      };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: RESOURCES.map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
    })),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const found = RESOURCES.find((r) => r.uri === req.params.uri);
    if (!found) {
      throw new Error(`Unknown resource: ${req.params.uri}`);
    }
    return found.read(client);
  });

  return server;
}
