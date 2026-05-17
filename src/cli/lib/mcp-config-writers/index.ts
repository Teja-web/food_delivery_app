/**
 * Per-editor MCP config writers.
 *
 * Each writer merges a `coznt` entry into the editor's config without
 * destroying existing entries. Returns the path written and whether it
 * was a merge or an overwrite of a prior `coznt` entry.
 *
 * All writers are non-destructive: any unrelated `mcpServers` /
 * `context_servers` entries are preserved verbatim.
 */

import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import type { EditorName } from "../editor-detect.js";
import type { CozntMcpEntry, WriteResult, WriterContext } from "./types.js";

function readJsonIfExists(path: string): Record<string, unknown> | null {
  try {
    statSync(path);
  } catch {
    return null;
  }
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

function mergeMcpServersShape(
  existing: Record<string, unknown> | null,
  field: "mcpServers" | "context_servers",
  entry: CozntMcpEntry,
  toEntryShape: (entry: CozntMcpEntry) => unknown,
): { merged: Record<string, unknown>; overwrote: boolean } {
  const base = existing ?? {};
  const servers = (base[field] as Record<string, unknown> | undefined) ?? {};
  const overwrote = "coznt" in servers;
  servers["coznt"] = toEntryShape(entry);
  base[field] = servers;
  return { merged: base, overwrote };
}

function claudeCodeEntry(e: CozntMcpEntry) {
  return { command: e.command, args: e.args, env: e.env };
}

function cursorEntry(e: CozntMcpEntry) {
  return { command: e.command, args: e.args, env: e.env };
}

function clineEntry(e: CozntMcpEntry) {
  return {
    command: e.command,
    args: e.args,
    env: e.env,
    disabled: false,
    autoApprove: [] as string[],
  };
}

function zedEntry(e: CozntMcpEntry) {
  return { command: { path: e.command, args: e.args, env: e.env } };
}

function continueEntry(e: CozntMcpEntry) {
  return { command: e.command, args: e.args, env: e.env };
}

export function writeClaudeCode(ctx: WriterContext): WriteResult {
  const path = join(ctx.repoRoot, ".claude", "mcp.json");
  const existing = readJsonIfExists(path);
  const { merged, overwrote } = mergeMcpServersShape(
    existing,
    "mcpServers",
    ctx.cozntEntry,
    claudeCodeEntry,
  );
  writeJson(path, merged);
  return { path, merged: existing !== null, overwrote };
}

export function writeCursor(ctx: WriterContext): WriteResult {
  const path = join(ctx.repoRoot, ".cursor", "mcp.json");
  const existing = readJsonIfExists(path);
  const { merged, overwrote } = mergeMcpServersShape(
    existing,
    "mcpServers",
    ctx.cozntEntry,
    cursorEntry,
  );
  writeJson(path, merged);
  return { path, merged: existing !== null, overwrote };
}

export function writeCline(ctx: WriterContext): WriteResult {
  const path = join(ctx.repoRoot, ".cline", "mcp.json");
  const existing = readJsonIfExists(path);
  const { merged, overwrote } = mergeMcpServersShape(
    existing,
    "mcpServers",
    ctx.cozntEntry,
    clineEntry,
  );
  writeJson(path, merged);
  return { path, merged: existing !== null, overwrote };
}

export function writeZed(ctx: WriterContext): WriteResult {
  const path = join(ctx.repoRoot, ".zed", "settings.json");
  const existing = readJsonIfExists(path);
  const { merged, overwrote } = mergeMcpServersShape(
    existing,
    "context_servers",
    ctx.cozntEntry,
    zedEntry,
  );
  writeJson(path, merged);
  return { path, merged: existing !== null, overwrote };
}

export function writeContinue(ctx: WriterContext): WriteResult {
  const path = join(ctx.repoRoot, ".continue", "mcp.json");
  const existing = readJsonIfExists(path);
  const { merged, overwrote } = mergeMcpServersShape(
    existing,
    "mcpServers",
    ctx.cozntEntry,
    continueEntry,
  );
  writeJson(path, merged);
  return { path, merged: existing !== null, overwrote };
}

export function writeForEditor(name: EditorName, ctx: WriterContext): WriteResult {
  switch (name) {
    case "claude-code":
      return writeClaudeCode(ctx);
    case "cursor":
      return writeCursor(ctx);
    case "cline":
      return writeCline(ctx);
    case "zed":
      return writeZed(ctx);
    case "continue":
      return writeContinue(ctx);
  }
}
