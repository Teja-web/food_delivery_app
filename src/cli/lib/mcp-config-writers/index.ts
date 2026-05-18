/**
 * Per-editor MCP config writers.
 *
 * Each writer merges a `coznt` entry into the host's config file
 * non-destructively. The actual per-host entry shapes live in the
 * isomorphic `@/lib/mcp/host-config` module — this file only owns the
 * "merge with what's already on disk" semantics.
 *
 * Any unrelated `mcpServers` / `context_servers` entries are preserved.
 */

import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import { HOST_SHAPES, type HostName } from "@/lib/mcp/host-config";
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

export function writeForEditor(name: EditorName, ctx: WriterContext): WriteResult {
  const shape = HOST_SHAPES[name as HostName];
  const path = join(ctx.repoRoot, shape.path);
  const existing = readJsonIfExists(path);
  const base = existing ?? {};
  const field = shape.field;
  const servers =
    (base[field] as Record<string, unknown> | undefined) ?? {};
  const overwrote = "coznt" in servers;
  servers["coznt"] = shape.entry(ctx.cozntEntry as CozntMcpEntry);
  base[field] = servers;
  writeJson(path, base);
  return { path, merged: existing !== null, overwrote };
}
