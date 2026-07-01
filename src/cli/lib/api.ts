/**
 * HTTP client for the choreography distribution endpoints.
 *
 * `coznt sync` only ever calls `/api/v1/mcp/choreographies` and
 * `/api/v1/mcp/choreographies/sync` — two read-only endpoints. We
 * intentionally do NOT import `src/mcp/client.ts` here; that module is
 * coupled to MCP SDK build paths and we want the CLI to ship cleanly
 * as its own bundle.
 */

import type { CozntConfig } from "./config";
import { resolveApiKey } from "./auth";

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

export interface StandardsManifestEntry {
  slug: string;
  version: string;
  hash: string;
  title: string;
  kind: string;
  scope: "org" | "project";
  format: "markdown" | "text";
  updatedAt: string;
}

export interface StandardsManifest {
  standards: StandardsManifestEntry[];
  missingRequired: string[];
  requiredComplete: boolean;
  manifestHash: string;
}

export interface BundleEntry extends ManifestEntry {
  content: string;
}

export interface CustomBundleEntry extends BundleEntry {
  /** "project" or "org" — distinguishes scope of the customer-authored row. */
  scope: "project" | "org";
}

export interface Bundle {
  /** Platform-shipped choreographies. */
  choreographies: BundleEntry[];
  /** Customer-authored choreographies (may be absent from older servers). */
  custom?: CustomBundleEntry[];
  manifestHash: string;
}

export interface StandardsBundleEntry extends StandardsManifestEntry {
  content: string;
}

export interface StandardsBundle extends Omit<StandardsManifest, "standards"> {
  standards: StandardsBundleEntry[];
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
      const errBody = (await res.json()) as { error?: string; message?: string };
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

export async function fetchStandardsManifest(cfg: CozntConfig): Promise<StandardsManifest> {
  const params = new URLSearchParams({ projectId: cfg.projectId });
  try {
    return await request<StandardsManifest>(cfg, "GET", `/api/v1/mcp/standards?${params.toString()}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return { standards: [], missingRequired: [], requiredComplete: true, manifestHash: "" };
    }
    throw err;
  }
}

export async function fetchStandardsBundle(
  cfg: CozntConfig,
  slugs?: string[],
): Promise<StandardsBundle> {
  return request<StandardsBundle>(cfg, "POST", "/api/v1/mcp/standards/sync", {
    projectId: cfg.projectId,
    slugs,
  });
}
