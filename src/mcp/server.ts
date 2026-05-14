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
 * Excluded by design (let GitHub/Jira stay the source of truth, observe
 * via webhook): create-pr, push-to-external, setup-workspace.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { CozntClient, CozntApiError, readConfig } from "./client.js";
import { readConventions } from "./resources/conventions.js";
import { readHistory } from "./resources/history.js";
import { readMyTasks } from "./resources/my-tasks.js";
import { getMyContextInput, runGetMyContext } from "./tools/get-my-context.js";
import { logDecisionInput, runLogDecision } from "./tools/log-decision.js";
import { markGatePassedInput, runMarkGatePassed } from "./tools/mark-gate-passed.js";
import { sessionEndInput, runSessionEnd } from "./tools/session-end.js";
import { sessionStartInput, runSessionStart } from "./tools/session-start.js";
import { submitForApprovalInput, runSubmitForApproval } from "./tools/submit-for-approval.js";

import { z, ZodTypeAny } from "zod";

const SERVER_NAME = "coznt-mcp";
const SERVER_VERSION = "0.1.0";

interface ToolDef<T extends ZodTypeAny> {
  name: string;
  description: string;
  schema: T;
  run: (client: CozntClient, input: z.infer<T>) => Promise<unknown>;
}

function tool<T extends ZodTypeAny>(def: ToolDef<T>): ToolDef<T> {
  return def;
}

const tools = [
  tool({
    name: "get_my_context",
    description: [
      "Orient at session start. Returns the active project, current phase,",
      "phase discipline (allowed/forbidden lists), active rules, available",
      "skills (with their autonomy levels), and recent ADRs.",
      "Call this FIRST in any session — every other tool's behavior depends",
      "on what's in the response.",
    ].join(" "),
    schema: getMyContextInput,
    run: runGetMyContext,
  }),
  tool({
    name: "mark_gate_passed",
    description: [
      "Flip a phase gate to passed. Server checks: (1) the gate belongs to",
      "the project's current phase, (2) the API key has scope. If every",
      "gate in the current phase is now passed/skipped, coznt auto-advances",
      "the project to the next phase and notifies every org member.",
    ].join(" "),
    schema: markGatePassedInput,
    run: runMarkGatePassed,
  }),
  tool({
    name: "submit_for_approval",
    description: [
      "Submit a plan, gate, release, or work_item for human approval.",
      "Creates an approval row that appears on the /approvals inbox.",
      "Use this when the work is done from the agent's side but needs",
      "a human sign-off before it can proceed.",
    ].join(" "),
    schema: submitForApprovalInput,
    run: runSubmitForApproval,
  }),
  tool({
    name: "log_decision",
    description: [
      "Record an Architecture Decision Record. ADRs are stored as `plan`",
      "rows with `kind: \"adr\"`. Typically used in the Design phase.",
      "Server rejects the call if the current phase forbids it (see the",
      "forbidden list in get_my_context).",
    ].join(" "),
    schema: logDecisionInput,
    run: runLogDecision,
  }),
  tool({
    name: "session_start",
    description: [
      "Open a session on coznt's side. Returns a sessionId that's recorded",
      "in the audit log alongside every subsequent tool call. Call this",
      "after get_my_context so the audit trail is complete.",
    ].join(" "),
    schema: sessionStartInput,
    run: runSessionStart,
  }),
  tool({
    name: "session_end",
    description: [
      "Close the current session and write its summary (outcome, duration,",
      "tool call count) to the audit log. Idempotent — calling it twice is",
      "safe.",
    ].join(" "),
    schema: sessionEndInput,
    run: runSessionEnd,
  }),
] as const;

const RESOURCES = [
  {
    uri: "coznt://conventions",
    name: "Active conventions and rules",
    description: "The rules coznt enforces for this project (severity, phase scope, body).",
    mimeType: "application/json",
    read: readConventions,
  },
  {
    uri: "coznt://my-tasks",
    name: "Your tasks",
    description: "Work items and open plans visible to this API key.",
    mimeType: "application/json",
    read: readMyTasks,
  },
  {
    uri: "coznt://history",
    name: "Recent audit history",
    description: "Last 7 days of audit events for this project.",
    mimeType: "application/json",
    read: readHistory,
  },
] as const;

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
