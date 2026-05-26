/**
 * Host-config renderer — one source of truth for "what does coznt's
 * MCP entry look like in host X."
 *
 * Asserts every supported host renders a complete file payload and that
 * the CLI writer + the standalone renderer produce equivalent shapes.
 */

import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
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
      const rendered = renderHostConfig(host, {
        serverUrl: SERVER_URL,
        apiKey: KEY_PLAINTEXT,
        mcpVersion: VERSION,
      });
      expect(rendered.path).toBe(HOST_SHAPES[host].path);
      expect(rendered.serialized).toContain(SERVER_URL);
      expect(rendered.serialized).toContain(KEY_PLAINTEXT);
      // Structural echo present for both JSON and TOML hosts.
      const field = HOST_SHAPES[host].field;
      const servers = (rendered.content as Record<string, unknown>)[field] as Record<string, unknown>;
      expect(servers.coznt).toBeDefined();
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

  it("codex emits TOML at the home-dir config.toml path", () => {
    const rendered = renderHostConfig("codex", {
      serverUrl: SERVER_URL,
      apiKey: KEY_PLAINTEXT,
      mcpVersion: VERSION,
    });
    expect(rendered.format).toBe("toml");
    expect(rendered.pathKind).toBe("home");
    expect(rendered.path).toBe(".codex/config.toml");
    expect(rendered.serialized).toContain("[mcp_servers.coznt]");
    expect(rendered.serialized).toContain("[mcp_servers.coznt.env]");
    expect(rendered.serialized).toContain(`COZNT_URL = "${SERVER_URL}"`);
    expect(rendered.serialized).toContain(`COZNT_API_KEY = "${KEY_PLAINTEXT}"`);
  });

  it("CLI writer produces the same per-host entry shape as the renderer (JSON hosts)", () => {
    // Codex is excluded — it writes TOML to ~/.codex/config.toml, asserted separately.
    const cozntEntry = {
      command: "npx",
      args: ["-y", tarballUrl(SERVER_URL, VERSION)],
      env: { COZNT_URL: SERVER_URL, COZNT_API_KEY: KEY_PLAINTEXT },
    };
    const tmp = mkdtempSync(join(tmpdir(), "host-config-parity-"));
    try {
      for (const host of SUPPORTED_HOSTS) {
        if (HOST_SHAPES[host].format === "toml") continue;
        if (HOST_SHAPES[host].pathKind === "home") continue;
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

  it("CLI writer writes Codex TOML at ~/.codex/config.toml", () => {
    // Sandbox HOME so we don't touch the developer's real ~/.codex.
    const tmp = mkdtempSync(join(tmpdir(), "host-config-codex-"));
    const prevHome = process.env.HOME;
    const prevUserProfile = process.env.USERPROFILE;
    process.env.HOME = tmp;
    process.env.USERPROFILE = tmp;
    try {
      const cozntEntry = {
        command: "npx",
        args: ["-y", tarballUrl(SERVER_URL, VERSION)],
        env: { COZNT_URL: SERVER_URL, COZNT_API_KEY: KEY_PLAINTEXT },
      };
      const result = writeForEditor("codex", { repoRoot: tmp, cozntEntry });
      expect(result.path).toBe(join(tmp, ".codex/config.toml"));
      const written = readFileSync(result.path, "utf-8");
      expect(written).toContain("[mcp_servers.coznt]");
      expect(written).toContain(`command = "npx"`);
      expect(written).toContain(`COZNT_API_KEY = "${KEY_PLAINTEXT}"`);
      expect(written).toContain(`COZNT_URL = "${SERVER_URL}"`);
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      if (prevUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = prevUserProfile;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("Codex TOML writer is non-destructive — preserves unrelated sections and overwrites prior coznt", () => {
    const tmp = mkdtempSync(join(tmpdir(), "host-config-codex-merge-"));
    const prevHome = process.env.HOME;
    const prevUserProfile = process.env.USERPROFILE;
    process.env.HOME = tmp;
    process.env.USERPROFILE = tmp;
    try {
      // Pre-seed a config with an unrelated server and a stale coznt block.
      mkdirSync(join(tmp, ".codex"), { recursive: true });
      writeFileSync(
        join(tmp, ".codex/config.toml"),
        [
          "# user comment",
          `model = "gpt-5"`,
          "",
          "[mcp_servers.other]",
          `command = "/usr/bin/other"`,
          "",
          "[mcp_servers.coznt]",
          `command = "stale"`,
          "",
          "[mcp_servers.coznt.env]",
          `STALE = "yes"`,
          "",
        ].join("\n"),
        "utf-8",
      );
      const cozntEntry = {
        command: "npx",
        args: ["-y", tarballUrl(SERVER_URL, VERSION)],
        env: { COZNT_URL: SERVER_URL, COZNT_API_KEY: KEY_PLAINTEXT },
      };
      const result = writeForEditor("codex", { repoRoot: tmp, cozntEntry });
      expect(result.merged).toBe(true);
      expect(result.overwrote).toBe(true);
      const written = readFileSync(result.path, "utf-8");
      // Unrelated stuff preserved
      expect(written).toContain("# user comment");
      expect(written).toContain(`model = "gpt-5"`);
      expect(written).toContain("[mcp_servers.other]");
      expect(written).toContain(`command = "/usr/bin/other"`);
      // Stale coznt gone, fresh coznt written
      expect(written).not.toContain(`command = "stale"`);
      expect(written).not.toContain(`STALE = "yes"`);
      expect(written).toContain(`COZNT_URL = "${SERVER_URL}"`);
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      if (prevUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = prevUserProfile;
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
