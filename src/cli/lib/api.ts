/**
 * HTTP client for the choreography distribution endpoints.
 *
 * `coznt sync` only ever calls `/api/v1/mcp/choreographies` and
 * `/api/v1/mcp/choreographies/sync` — two read-only endpoints. We
 * intentionally do NOT import `src/mcp/client.ts` here; that module is
 * coupled to MCP SDK build paths and we want the CLI to ship cleanly
 * as its own bundle.
 */

import type { CozntConfig } from "./config.js";
import { resolveApiKey } from "./auth.js";

export interface ManifestEntry {
  slug: string;
  version: string;
  hash: string;
  description: string;
  minAutonomy: number | null;
}

export interface Manifest {
  choreographies: ManifestEntry[];
  manifestHash: string;
}

export interface BundleEntry extends ManifestEntry {
  content: string;
}

export interface Bundle {
  choreographies: BundleEntry[];
  manifestHash: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  cfg: CozntConfig,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const apiKey = resolveApiKey(cfg.apiKeyRef);
  const url = `${cfg.serverUrl}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const errBody = await res.json();
      detail = errBody?.error ?? errBody?.message ?? "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new ApiError(
      `${method} ${path} failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`,
      res.status,
    );
  }

  return (await res.json()) as T;
}

export async function fetchManifest(cfg: CozntConfig): Promise<Manifest> {
  const params = new URLSearchParams({ projectId: cfg.projectId });
  return request<Manifest>(cfg, "GET", `/api/v1/mcp/choreographies?${params.toString()}`);
}

export async function fetchBundle(cfg: CozntConfig, slugs?: string[]): Promise<Bundle> {
  return request<Bundle>(cfg, "POST", "/api/v1/mcp/choreographies/sync", {
    projectId: cfg.projectId,
    slugs,
  });
}
