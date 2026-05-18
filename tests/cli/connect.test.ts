/**
 * `coznt connect` — unit-level tests for the pieces that don't need
 * stdin / network: editor detection, MCP config merge, gitignore.
 *
 * End-to-end orchestration (project picker → key store → sync) is
 * exercised in `sync.test.ts` (sync) and is not unit-tested here
 * because it requires interactive prompts.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { detectEditors } from "@/cli/lib/editor-detect";
import { writeForEditor } from "@/cli/lib/mcp-config-writers";
import { ensureCozntLocalGitignored } from "@/cli/lib/gitignore";

const writeClaudeCode = (ctx: { repoRoot: string; cozntEntry: typeof cozntEntry }) =>
  writeForEditor("claude-code", ctx);
const writeCursor = (ctx: { repoRoot: string; cozntEntry: typeof cozntEntry }) =>
  writeForEditor("cursor", ctx);
const writeZed = (ctx: { repoRoot: string; cozntEntry: typeof cozntEntry }) =>
  writeForEditor("zed", ctx);

const cozntEntry = {
  command: "pnpm",
  args: ["--filter", "coznt", "mcp"],
  env: { COZNT_URL: "http://test", COZNT_API_KEY: "${COZNT_API_KEY}" },
};

let tmpRoot = "";

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "coznt-connect-test-"));
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("editor detection", () => {
  it("returns empty when no editor directories exist", () => {
    expect(detectEditors(tmpRoot)).toHaveLength(0);
  });

  it("detects a single editor", () => {
    mkdirSync(join(tmpRoot, ".claude"));
    const found = detectEditors(tmpRoot);
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe("claude-code");
  });

  it("detects multiple editors in priority order", () => {
    mkdirSync(join(tmpRoot, ".cursor"));
    mkdirSync(join(tmpRoot, ".claude"));
    mkdirSync(join(tmpRoot, ".zed"));
    const found = detectEditors(tmpRoot);
    expect(found.map((e) => e.name)).toEqual(["claude-code", "cursor", "zed"]);
  });
});

describe("MCP config writers", () => {
  it("Claude Code writes a fresh config when none exists", () => {
    const result = writeClaudeCode({ repoRoot: tmpRoot, cozntEntry });
    expect(result.merged).toBe(false);
    expect(result.overwrote).toBe(false);
    const content = JSON.parse(readFileSync(result.path, "utf-8"));
    expect(content.mcpServers.coznt.command).toBe("pnpm");
    expect(content.mcpServers.coznt.env.COZNT_URL).toBe("http://test");
  });

  it("Claude Code merges into an existing config without destroying other entries", () => {
    mkdirSync(join(tmpRoot, ".claude"));
    writeFileSync(
      join(tmpRoot, ".claude", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          filesystem: { command: "npx", args: ["@modelcontextprotocol/server-filesystem"] },
        },
      }),
    );
    const result = writeClaudeCode({ repoRoot: tmpRoot, cozntEntry });
    expect(result.merged).toBe(true);
    expect(result.overwrote).toBe(false);
    const content = JSON.parse(readFileSync(result.path, "utf-8"));
    expect(Object.keys(content.mcpServers).sort()).toEqual(["coznt", "filesystem"]);
  });

  it("Claude Code overwrites a prior coznt entry and flags overwrote=true", () => {
    mkdirSync(join(tmpRoot, ".claude"));
    writeFileSync(
      join(tmpRoot, ".claude", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          coznt: { command: "old", args: [], env: {} },
          filesystem: { command: "npx", args: [] },
        },
      }),
    );
    const result = writeClaudeCode({ repoRoot: tmpRoot, cozntEntry });
    expect(result.overwrote).toBe(true);
    const content = JSON.parse(readFileSync(result.path, "utf-8"));
    expect(content.mcpServers.coznt.command).toBe("pnpm");
    expect(content.mcpServers.filesystem.command).toBe("npx");
  });

  it("Cursor writes to .cursor/mcp.json", () => {
    const result = writeCursor({ repoRoot: tmpRoot, cozntEntry });
    expect(result.path).toBe(join(tmpRoot, ".cursor", "mcp.json"));
    const content = JSON.parse(readFileSync(result.path, "utf-8"));
    expect(content.mcpServers.coznt).toBeDefined();
  });

  it("Zed uses the context_servers shape with a nested command object", () => {
    const result = writeZed({ repoRoot: tmpRoot, cozntEntry });
    const content = JSON.parse(readFileSync(result.path, "utf-8"));
    expect(content.context_servers.coznt.command.path).toBe("pnpm");
    expect(content.context_servers.coznt.command.args).toEqual(["--filter", "coznt", "mcp"]);
  });

  it("Zed merges into existing settings.json without destroying user settings", () => {
    mkdirSync(join(tmpRoot, ".zed"));
    writeFileSync(
      join(tmpRoot, ".zed", "settings.json"),
      JSON.stringify({ theme: "One Dark", context_servers: { other: { command: { path: "x", args: [] } } } }),
    );
    const result = writeZed({ repoRoot: tmpRoot, cozntEntry });
    expect(result.merged).toBe(true);
    const content = JSON.parse(readFileSync(result.path, "utf-8"));
    expect(content.theme).toBe("One Dark");
    expect(Object.keys(content.context_servers).sort()).toEqual(["coznt", "other"]);
  });
});

describe("gitignore helper", () => {
  it("creates .gitignore with the entry when none exists", () => {
    const r = ensureCozntLocalGitignored(tmpRoot);
    expect(r.changed).toBe(true);
    const content = readFileSync(r.path, "utf-8");
    expect(content).toContain(".coznt/.local/");
  });

  it("is idempotent if the entry is already present", () => {
    writeFileSync(join(tmpRoot, ".gitignore"), "node_modules\n.coznt/.local/\n");
    const r = ensureCozntLocalGitignored(tmpRoot);
    expect(r.changed).toBe(false);
  });

  it("appends to an existing .gitignore preserving prior entries", () => {
    writeFileSync(join(tmpRoot, ".gitignore"), "node_modules\n.env\n");
    const r = ensureCozntLocalGitignored(tmpRoot);
    expect(r.changed).toBe(true);
    const content = readFileSync(r.path, "utf-8");
    expect(content).toContain("node_modules");
    expect(content).toContain(".env");
    expect(content).toContain(".coznt/.local/");
  });

  it("does NOT add .coznt/skills/ to gitignore", () => {
    const r = ensureCozntLocalGitignored(tmpRoot);
    const content = readFileSync(r.path, "utf-8");
    expect(content).not.toContain(".coznt/skills/");
  });

  it("survives without touching files other than .gitignore", () => {
    ensureCozntLocalGitignored(tmpRoot);
    expect(existsSync(join(tmpRoot, ".coznt"))).toBe(false);
  });
});
