/**
 * Subprocess MCP smoke test.
 *
 * Spawns the real `src/mcp/bin.ts` as a child process and drives it
 * through the MCP SDK's `StdioClientTransport`. This is the layer the
 * in-process registry tests can't cover:
 *
 *   - bin.ts startup (env handling, transport setup)
 *   - stdio JSON-RPC framing through the SDK
 *   - initialize handshake against a real server instance
 *   - tools/list returns what's registered
 *   - tools/call dispatch end-to-end
 *   - structured error path when the underlying coznt API is unreachable
 *
 * Pre-conditions:
 *   - tsx available via `pnpm exec` (it is — listed in package.json dev deps)
 *   - port 39999 NOT reachable on localhost (the test points COZNT_URL there
 *     deliberately so HTTP-needing verbs fail cleanly)
 *
 * Skipped via `CI_SKIP_MCP_SMOKE=1` if needed (some CI envs forbid
 * spawning subprocesses).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SKIP = process.env.CI_SKIP_MCP_SMOKE === "1";
const REPO_ROOT = path.resolve(__dirname, "../..");
// Use a localhost port we expect to be closed. The MCP server's HTTP
// client will get ECONNREFUSED, which is exactly the failure mode we
// want to exercise — server must surface it as a structured error,
// not crash.
const UNREACHABLE_API = "http://127.0.0.1:39999";

describe.skipIf(SKIP)("MCP subprocess smoke", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      // `pnpm exec tsx` resolves tsx from node_modules — portable across
      // dev machines without requiring tsx in PATH.
      command: "pnpm",
      args: ["exec", "tsx", "src/mcp/bin.ts"],
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        COZNT_API_KEY: "smoke_test_not_a_real_key",
        COZNT_URL: UNREACHABLE_API,
      },
    });
    client = new Client(
      { name: "coznt-smoke-test", version: "0.0.0" },
      { capabilities: {} },
    );
    await client.connect(transport);
  }, 30_000);

  afterAll(async () => {
    // Closing the client closes the transport, which kills the child process.
    try {
      await client?.close();
    } catch {
      // ignore — already exited
    }
  });

  it("completes the initialize handshake", () => {
    // If beforeAll resolved, the handshake worked. This is the sanity
    // check that we're talking real MCP, not just spawning a process.
    expect(client).toBeTruthy();
    expect(transport).toBeTruthy();
  });

  it("tools/list returns at least 21 verbs (Tier 1 + 2 + 3 floor)", async () => {
    const res = await client.listTools();
    expect(Array.isArray(res.tools)).toBe(true);
    expect(res.tools.length).toBeGreaterThanOrEqual(21);
  });

  it("tools/list includes load-bearing verbs from each tier", async () => {
    const res = await client.listTools();
    const names = new Set(res.tools.map((t) => t.name));
    const expected = [
      // Tier 1
      "set_project",
      "get_my_context",
      "get_project_status",
      "advance_phase",
      // Tier 2
      "create_requirement",
      "get_design_context",
      "update_test_result",
      // Tier 3
      "invoke_skill",
      "draft_requirement",
      "list_draft_requirements",
    ];
    for (const v of expected) {
      expect(names.has(v), `missing ${v}`).toBe(true);
    }
  });

  it("every advertised tool has a non-empty inputSchema", async () => {
    const res = await client.listTools();
    for (const t of res.tools) {
      expect(t.inputSchema, `${t.name} missing inputSchema`).toBeTruthy();
      expect(typeof t.inputSchema, `${t.name} inputSchema not an object`).toBe("object");
    }
  });

  it("draft_requirement → list_draft_requirements round-trip (in-memory, no API)", async () => {
    // Drafts live in MCP-process memory; they don't hit COZNT_URL. This is
    // the cleanest end-to-end dispatcher test that doesn't depend on the
    // coznt API being up.
    const title = `smoke-${Date.now()}`;
    const create = await client.callTool({
      name: "draft_requirement",
      arguments: { title, summary: "round-trip smoke" },
    });
    expect(create.isError).not.toBe(true);

    const list = await client.callTool({
      name: "list_draft_requirements",
      arguments: {},
    });
    expect(list.isError).not.toBe(true);
    // Content is array of {type, text}; the verb returns JSON in `text`.
    const content = list.content as Array<{ type: string; text: string }>;
    const blob = content.map((c) => c.text).join("\n");
    expect(blob).toContain(title);
  });

  it("get_my_context returns a structured error when coznt API is unreachable", async () => {
    // Fast-fail doesn't apply (get_my_context is ALWAYS_ALLOWED, and no
    // project is bound so it'd pass through). The CozntClient.fetch will
    // get ECONNREFUSED. The dispatcher must catch and return isError,
    // not crash the subprocess.
    const res = await client.callTool({
      name: "get_my_context",
      arguments: {},
    });
    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text, "error message should be non-empty").toBeTruthy();
  });

  it("phase-gated verb fails fast (local check) with a recoverable message", async () => {
    // No project bound → checkLocalPhase rejects verbs other than
    // set_project / get_my_context. log_decision should be rejected
    // locally without any network call.
    const res = await client.callTool({
      name: "log_decision",
      arguments: {
        projectId: "p_dummy",
        title: "x",
        summary: "y",
      },
    });
    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toContain("set_project");
  });

  it("unknown tool name returns isError, doesn't crash the server", async () => {
    // The dispatcher branch for unknown tools must surface a clean error.
    // Some SDK versions reject unknown tools at the client; others pass
    // through. Either path should not crash the subprocess.
    try {
      const res = await client.callTool({
        name: "definitely_not_a_real_verb_xyz",
        arguments: {},
      });
      expect(res.isError).toBe(true);
    } catch (err) {
      // SDK client rejected at its layer — that's fine, the subprocess
      // is still alive (the next test will use it).
      expect(err).toBeTruthy();
    }
  });

  it("server is still alive after the error cases", async () => {
    // Regression: confirms none of the prior error-path tests killed
    // the subprocess. A fresh tools/list call must still work.
    const res = await client.listTools();
    expect(res.tools.length).toBeGreaterThanOrEqual(21);
  });
});
