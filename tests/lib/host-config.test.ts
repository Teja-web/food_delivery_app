/**
 * Host-config renderer — one source of truth for "what does coznt's
 * MCP entry look like in host X."
 *
 * Asserts every supported host renders a complete file payload and that
 * the CLI writer + the standalone renderer produce equivalent shapes.
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  HOST_SHAPES,
  SUPPORTED_HOSTS,
  renderHostConfig,
  tarballUrl,
} from "@/lib/mcp/host-config";
import { writeForEditor } from "@/cli/lib/mcp-config-writers";

const SERVER_URL = "https://coznt.example.com";
const KEY_PLAINTEXT = "ck_test_abc123";
const VERSION = "0.0.0-test";

describe("renderHostConfig", () => {
  it("supports all 10 hosts the CLI knows about", () => {
    expect(SUPPORTED_HOSTS).toHaveLength(10);
  });

  it.each([...SUPPORTED_HOSTS])(
    "%s renders a complete payload with serverUrl + apiKey embedded",
    (host) => {
      const { path, content } = renderHostConfig(host, {
        serverUrl: SERVER_URL,
        apiKey: KEY_PLAINTEXT,
        mcpVersion: VERSION,
      });
      expect(path).toBe(HOST_SHAPES[host].path);
      const field = HOST_SHAPES[host].field;
      const servers = (content as Record<string, unknown>)[field] as Record<string, unknown>;
      expect(servers.coznt).toBeDefined();
      const json = JSON.stringify(content);
      expect(json).toContain(SERVER_URL);
      expect(json).toContain(KEY_PLAINTEXT);
    },
  );

  it("zed uses the context_servers field, not mcpServers", () => {
    const { content } = renderHostConfig("zed", {
      serverUrl: SERVER_URL,
      apiKey: KEY_PLAINTEXT,
      mcpVersion: VERSION,
    });
    expect(content).toHaveProperty("context_servers");
    expect(content).not.toHaveProperty("mcpServers");
  });

  it("factory marks sensitive verbs as disable-model-invocation", () => {
    const { content } = renderHostConfig("factory", {
      serverUrl: SERVER_URL,
      apiKey: KEY_PLAINTEXT,
      mcpVersion: VERSION,
    });
    const coznt = (content as { mcpServers: { coznt: Record<string, unknown> } }).mcpServers.coznt;
    expect(coznt["disable-model-invocation"]).toEqual([
      "invoke_skill",
      "upsert_plan",
      "mark_gate_passed",
      "advance_phase",
    ]);
  });

  it("cline includes the disabled + autoApprove fields the host expects", () => {
    const { content } = renderHostConfig("cline", {
      serverUrl: SERVER_URL,
      apiKey: KEY_PLAINTEXT,
      mcpVersion: VERSION,
    });
    const coznt = (content as { mcpServers: { coznt: Record<string, unknown> } }).mcpServers.coznt;
    expect(coznt.disabled).toBe(false);
    expect(coznt.autoApprove).toEqual([]);
  });

  it("CLI writer produces the same per-host entry shape as the renderer", () => {
    // Both should agree on the `coznt` entry — renderer builds a fresh
    // file, writer merges into an empty dir. Feed the writer the same
    // launcher tuple the renderer uses (npx + tarball URL).
    const cozntEntry = {
      command: "npx",
      args: ["-y", tarballUrl(SERVER_URL, VERSION)],
      env: { COZNT_URL: SERVER_URL, COZNT_API_KEY: KEY_PLAINTEXT },
    };
    const tmp = mkdtempSync(join(tmpdir(), "host-config-parity-"));
    try {
      for (const host of SUPPORTED_HOSTS) {
        writeForEditor(host, { repoRoot: tmp, cozntEntry });
        const written = JSON.parse(
          readFileSync(join(tmp, HOST_SHAPES[host].path), "utf-8"),
        );
        const rendered = renderHostConfig(host, {
          serverUrl: SERVER_URL,
          apiKey: KEY_PLAINTEXT,
          mcpVersion: VERSION,
        }).content;
        const field = HOST_SHAPES[host].field;
        expect(written[field].coznt).toEqual(
          (rendered as { [k: string]: Record<string, unknown> })[field].coznt,
        );
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
