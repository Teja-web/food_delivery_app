/**
 * Host-MCP config rendering — single source of truth for "what does
 * coznt's MCP entry look like in host X."
 *
 * Used by:
 *   - the CLI writers (merge into the dev's existing host config file)
 *   - the in-product Connect UI on /api-keys (render a full file payload
 *     for copy/download)
 *
 * Each host has:
 *   - `field` — top-level key the host uses to hold MCP servers
 *     (`mcpServers` for most, `context_servers` for Zed)
 *   - `path` — relative path inside the dev's repo where the file lives
 *   - `entry(cmd)` — pure function producing the per-host entry shape
 *     for coznt's MCP server (some hosts have extra keys like
 *     `disable-model-invocation`, `autoApprove`).
 *
 * Pure module — no I/O. Isomorphic, safe to import client- or server-side.
 */

export const SUPPORTED_HOSTS = [
  "claude-code",
  "cursor",
  "cline",
  "zed",
  "continue",
  "codex",
  "factory",
  "hermes",
  "kiro",
  "opencode",
] as const;

export type HostName = (typeof SUPPORTED_HOSTS)[number];

export interface CozntMcpEntry {
  command: string;
  args: string[];
  env: Record<string, string>;
}

interface HostShape {
  /** Top-level JSON field the host stashes MCP servers under. */
  field: "mcpServers" | "context_servers";
  /** Repo-relative path of the host's config file. */
  path: string;
  /** Pure renderer for the per-host coznt entry. */
  entry: (cozntEntry: CozntMcpEntry) => unknown;
  /** Human-readable label for UI. */
  label: string;
}

function plain(e: CozntMcpEntry) {
  return { command: e.command, args: e.args, env: e.env };
}

export const HOST_SHAPES: Record<HostName, HostShape> = {
  "claude-code": {
    label: "Claude Code",
    field: "mcpServers",
    path: ".claude/mcp.json",
    entry: plain,
  },
  cursor: {
    label: "Cursor",
    field: "mcpServers",
    path: ".cursor/mcp.json",
    entry: plain,
  },
  cline: {
    label: "Cline",
    field: "mcpServers",
    path: ".cline/mcp.json",
    entry: (e) => ({
      command: e.command,
      args: e.args,
      env: e.env,
      disabled: false,
      autoApprove: [] as string[],
    }),
  },
  zed: {
    label: "Zed",
    field: "context_servers",
    path: ".zed/settings.json",
    entry: (e) => ({ command: { path: e.command, args: e.args, env: e.env } }),
  },
  continue: {
    label: "Continue",
    field: "mcpServers",
    path: ".continue/mcp.json",
    entry: plain,
  },
  codex: {
    label: "Codex",
    field: "mcpServers",
    path: ".codex/mcp.json",
    entry: plain,
  },
  factory: {
    label: "Factory",
    field: "mcpServers",
    path: ".factory/mcp.json",
    // Factory disables model-invocation of sensitive coznt verbs by
    // default — humans confirm. Mirrors gstack's factory adapter.
    entry: (e) => ({
      command: e.command,
      args: e.args,
      env: e.env,
      "disable-model-invocation": [
        "invoke_skill",
        "upsert_plan",
        "mark_gate_passed",
        "advance_phase",
      ],
    }),
  },
  hermes: {
    label: "Hermes",
    field: "mcpServers",
    path: ".hermes/mcp.json",
    entry: plain,
  },
  kiro: {
    label: "Kiro",
    field: "mcpServers",
    path: ".kiro/mcp.json",
    entry: plain,
  },
  opencode: {
    label: "OpenCode",
    field: "mcpServers",
    path: ".opencode/mcp.json",
    entry: plain,
  },
};

export interface RenderInput {
  /** coznt server URL (e.g. https://coznt.acme.internal). */
  serverUrl: string;
  /** Either the plaintext API key or a placeholder like `${COZNT_API_KEY}`. */
  apiKey: string;
  /** Default: `pnpm` + `--filter coznt mcp`. */
  launcher?: string;
  launcherArgs?: string[];
}

export interface RenderedHostConfig {
  /** Repo-relative path the dev pastes/writes this into. */
  path: string;
  /** Full file contents. */
  content: Record<string, unknown>;
}

/**
 * Render a complete config file for `host`. Used by the UI's
 * "Copy host config" affordance. CLI writers do a different merge-shape
 * operation that preserves existing entries — see `mcp-config-writers/`.
 */
export function renderHostConfig(
  host: HostName,
  input: RenderInput,
): RenderedHostConfig {
  const shape = HOST_SHAPES[host];
  const cozntEntry: CozntMcpEntry = {
    command: input.launcher ?? "pnpm",
    args: input.launcherArgs ?? ["--filter", "coznt", "mcp"],
    env: { COZNT_URL: input.serverUrl, COZNT_API_KEY: input.apiKey },
  };
  const content: Record<string, unknown> = {
    [shape.field]: { coznt: shape.entry(cozntEntry) },
  };
  return { path: shape.path, content };
}
