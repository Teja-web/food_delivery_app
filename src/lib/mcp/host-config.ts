/**
 * Host-MCP config rendering — single source of truth for "what does
 * coznt's MCP entry look like in host X."
 *
 * Used by:
 *   - the CLI writers (merge into the dev's existing host config file)
 *   - the in-product Connect UI on /api-keys (render a full file payload
 *     for copy/download)
 *
 * Each host declares:
 *   - `field` — top-level key the host stashes MCP servers under
 *     (`mcpServers` for most JSON hosts, `context_servers` for Zed,
 *     `mcp_servers` for Codex's TOML).
 *   - `path` — config file path relative to the configured root.
 *   - `pathKind` — `repo` (resolved against the dev's repo root, default)
 *     or `home` (resolved against the OS home directory). Codex is the
 *     only `home` host today: its config lives at `~/.codex/config.toml`,
 *     not in any repo.
 *   - `format` — `json` (default) or `toml`. Codex is the only TOML host
 *     today. Adding more would just declare `format: "toml"` and rely on
 *     the existing TOML emitter — no special-case branching.
 *   - `entry(cmd)` — pure function producing the per-host entry shape for
 *     coznt's MCP server (some hosts have extra keys like
 *     `disable-model-invocation`, `autoApprove`).
 *
 * Pure module — no I/O. Isomorphic, safe to import client- or server-side.
 * Version-agnostic: callers pass `mcpVersion` explicitly so this file can be
 * consumed by both Turbopack (bundler resolution) and the CLI tarball
 * (NodeNext) without a build-system clash on `./version` import spelling.
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

export type HostFormat = "json" | "toml";
export type HostPathKind = "repo" | "home";

interface HostShape {
  /** Top-level key the host stashes MCP servers under. */
  field: "mcpServers" | "context_servers" | "mcp_servers";
  /** Config file path, relative to whatever `pathKind` resolves to. */
  path: string;
  /** Default `repo` (path joined to repo root). `home` joins to `os.homedir()`. */
  pathKind?: HostPathKind;
  /** Default `json`. `toml` triggers the TOML emitter + merger. */
  format?: HostFormat;
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
    // Codex reads `~/.codex/config.toml` exclusively — it does NOT honor
    // Cursor-style `.codex/mcp.json` in the repo. The CLI also accepts
    // `codex mcp add ...` as an out-of-band path, but the canonical
    // source is the TOML file. We write directly to it.
    label: "Codex",
    field: "mcp_servers",
    path: ".codex/config.toml",
    pathKind: "home",
    format: "toml",
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
  /** MCP tarball version. Callers import `MCP_VERSION` themselves. */
  mcpVersion: string;
  /**
   * Default: `npx -y ${serverUrl}/install/coznt-mcp-${mcpVersion}.tgz`. The
   * tarball is served by this very coznt instance — no public npm involvement,
   * version pinned to the running server.
   */
  launcher?: string;
  launcherArgs?: string[];
  /** Extra env vars merged into the entry's `env` (e.g. `COZNT_PROJECT`). */
  extraEnv?: Record<string, string>;
}

export interface RenderedHostConfig {
  /** Path the dev pastes/writes this into (repo-relative or home-relative per `pathKind`). */
  path: string;
  /** Where the path is resolved against. */
  pathKind: HostPathKind;
  /** On-disk format. */
  format: HostFormat;
  /**
   * For JSON hosts: the parsed object that would be the full file contents.
   * For TOML hosts: an `{ [field]: { coznt: {...} } }` echo for callers that
   * want a structured peek — but the canonical "ready to write" payload is
   * `serialized`.
   */
  content: Record<string, unknown>;
  /** Already-stringified file contents — copy/download this verbatim. */
  serialized: string;
}

/** Tarball URL the host should fetch via `npx -y <url>`. */
export function tarballUrl(serverUrl: string, version: string): string {
  return `${serverUrl.replace(/\/$/, "")}/install/coznt-mcp-${version}.tgz`;
}

function tomlEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function tomlString(s: string): string {
  return `"${tomlEscape(s)}"`;
}

/**
 * Serialize a single named MCP server entry as TOML sections.
 * Shape:
 *   [mcp_servers.coznt]
 *   command = "npx"
 *   args    = ["-y", "..."]
 *
 *   [mcp_servers.coznt.env]
 *   COZNT_URL     = "..."
 *   COZNT_API_KEY = "..."
 */
export function tomlServerSection(
  field: string,
  name: string,
  entry: CozntMcpEntry,
): string {
  const argList = entry.args.map(tomlString).join(", ");
  const out = [
    `[${field}.${name}]`,
    `command = ${tomlString(entry.command)}`,
    `args = [${argList}]`,
  ];
  if (Object.keys(entry.env).length > 0) {
    out.push("");
    out.push(`[${field}.${name}.env]`);
    for (const [k, v] of Object.entries(entry.env)) {
      out.push(`${k} = ${tomlString(v)}`);
    }
  }
  return out.join("\n");
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
  const url = tarballUrl(input.serverUrl, input.mcpVersion);
  const cozntEntry: CozntMcpEntry = {
    command: input.launcher ?? "npx",
    args: input.launcherArgs ?? ["-y", url],
    env: {
      COZNT_URL: input.serverUrl,
      COZNT_API_KEY: input.apiKey,
      ...(input.extraEnv ?? {}),
    },
  };
  const format = shape.format ?? "json";
  const pathKind = shape.pathKind ?? "repo";
  const content: Record<string, unknown> = {
    [shape.field]: { coznt: shape.entry(cozntEntry) },
  };
  const serialized =
    format === "toml"
      ? tomlServerSection(shape.field, "coznt", cozntEntry) + "\n"
      : JSON.stringify(content, null, 2) + "\n";
  return { path: shape.path, pathKind, format, content, serialized };
}
