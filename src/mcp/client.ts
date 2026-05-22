/**
 * Thin HTTP client used by every MCP tool/resource to talk to coznt's
 * `/api/v1` surface. The MCP server is a *client* of coznt — it does not
 * touch the database directly. That keeps the boundary clean: an agent
 * could just as well call these endpoints from a non-MCP integration
 * and get the same enforcement (autonomy × phase × rules).
 *
 * Auth: `COZNT_API_KEY` env var, presented as `Authorization: Bearer ...`
 * Base URL: `COZNT_URL` (default `http://localhost:3029`).
 */

export interface CozntClientConfig {
  baseUrl: string;
  apiKey: string;
}

export class CozntApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "CozntApiError";
  }
}

export function readConfig(): CozntClientConfig {
  const baseUrl = (process.env.COZNT_URL ?? "http://localhost:3029").replace(/\/$/, "");
  const apiKey = process.env.COZNT_API_KEY;
  if (!apiKey) {
    throw new Error("COZNT_API_KEY is required (project-pinned API key minted at /api-keys).");
  }
  return { baseUrl, apiKey };
}

export class CozntClient {
  constructor(private readonly cfg: CozntClientConfig) {}

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.cfg.apiKey}`,
      "Content-Type": "application/json",
    };
    // Repo policy enforcement (Change `add-per-repo-trust-policy`): when the
    // CLI / MCP launcher set `COZNT_REPO_URL`, forward it on every request
    // so server-side write routes can resolve the per-repo policy.
    const repoUrl = process.env.COZNT_REPO_URL;
    if (repoUrl) headers["X-Coznt-Repo-Url"] = repoUrl;

    const res = await fetch(`${this.cfg.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!res.ok) {
      const errBody = parsed as { error?: string; details?: unknown } | null;
      throw new CozntApiError(
        errBody?.error ?? `${method} ${path} failed (${res.status})`,
        res.status,
        errBody?.details,
      );
    }
    return parsed as T;
  }

  get<T>(path: string) {
    return this.request<T>("GET", path);
  }
  post<T>(path: string, body?: unknown) {
    return this.request<T>("POST", path, body);
  }
  patch<T>(path: string, body?: unknown) {
    return this.request<T>("PATCH", path, body);
  }
}
