/**
 * Per-editor MCP config writers.
 *
 * Each writer merges a `coznt` entry into the host's config file
 * non-destructively. The actual per-host entry shapes live in the
 * isomorphic `@/lib/mcp/host-config` module — this file only owns the
 * "merge with what's already on disk" semantics for the two on-disk
 * formats we support today: JSON (most hosts) and TOML (Codex).
 *
 * Any unrelated `mcpServers` / `context_servers` / `mcp_servers`
 * entries are preserved.
 */

import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import {
  HOST_SHAPES,
  tomlServerSection,
  type HostName,
} from "../../../lib/mcp/host-config.js";
import type { EditorName } from "../editor-detect.js";
import type { CozntMcpEntry, WriteResult, WriterContext } from "./types.js";

function readTextIfExists(path: string): string | null {
  try {
    statSync(path);
  } catch {
    return null;
  }
  return readFileSync(path, "utf-8");
}

function writeText(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, "utf-8");
}

function mergeJson(
  existing: string | null,
  field: string,
  entry: unknown,
): { merged: string; overwrote: boolean } {
  const base: Record<string, unknown> = existing
    ? (JSON.parse(existing) as Record<string, unknown>)
    : {};
  const servers =
    (base[field] as Record<string, unknown> | undefined) ?? {};
  const overwrote = "coznt" in servers;
  servers["coznt"] = entry;
  base[field] = servers;
  return { merged: JSON.stringify(base, null, 2) + "\n", overwrote };
}

/**
 * Merge a single `[<field>.coznt]` (+ `[<field>.coznt.env]`) section
 * into a TOML file. Any existing section block whose header starts with
 * `[<field>.coznt` is dropped (so we replace both the entry and its env
 * subtable). Comments and unrelated sections are preserved.
 *
 * Intentionally minimal — we control the writer side and never emit
 * inline-table form (`mcp_servers.coznt = { ... }`), so detecting only
 * section headers is enough for our own round-trips.
 */
function mergeToml(
  existing: string | null,
  field: string,
  entry: CozntMcpEntry,
): { merged: string; overwrote: boolean } {
  const prefix = `[${field}.coznt`;
  const lines = existing ? existing.split(/\r?\n/) : [];
  const kept: string[] = [];
  let skip = false;
  let overwrote = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      const matches = trimmed.startsWith(prefix);
      if (matches && !skip) overwrote = true;
      skip = matches;
    }
    if (!skip) kept.push(line);
  }
  while (kept.length > 0 && kept[kept.length - 1].trim() === "") kept.pop();
  if (kept.length > 0) kept.push("");
  kept.push(tomlServerSection(field, "coznt", entry));
  kept.push("");
  return { merged: kept.join("\n"), overwrote };
}

export function writeForEditor(name: EditorName, ctx: WriterContext): WriteResult {
  const shape = HOST_SHAPES[name as HostName];
  const root = shape.pathKind === "home" ? homedir() : ctx.repoRoot;
  const path = join(root, shape.path);
  const existing = readTextIfExists(path);
  const format = shape.format ?? "json";

  if (format === "toml") {
    const { merged, overwrote } = mergeToml(existing, shape.field, ctx.cozntEntry);
    writeText(path, merged);
    return { path, merged: existing !== null, overwrote };
  }

  const rendered = shape.entry(ctx.cozntEntry as CozntMcpEntry);
  const { merged, overwrote } = mergeJson(existing, shape.field, rendered);
  writeText(path, merged);
  return { path, merged: existing !== null, overwrote };
}
