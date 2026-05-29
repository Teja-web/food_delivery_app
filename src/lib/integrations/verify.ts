/**
 * Live credential verifiers per provider.
 *
 * Each verifier hits the provider's cheapest authenticated endpoint
 * (whoami / connectionData) and returns the account identity, or throws
 * with a human-readable error. Called by saveIntegrationCredentials before
 * persisting — a credential that can't auth never makes it to the DB.
 */

import type { AdapterProvider } from "@/db/schema/adapter-binding";

export interface VerifyResult {
  /** Account/user the provider returned (e.g. GitHub login, Jira email). */
  identity: string;
}

export async function verifyCredentials(
  provider: AdapterProvider,
  apiKey: string,
  config: Record<string, string>,
): Promise<VerifyResult> {
  switch (provider) {
    case "github":
      return verifyGitHub(apiKey);
    case "jira":
      return verifyJira(apiKey, config);
    case "ado":
      return verifyAdo(apiKey, config);
    case "confluence":
      return verifyConfluence(apiKey, config);
  }
}

async function verifyGitHub(token: string): Promise<VerifyResult> {
  const res = await safeFetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  }, "GitHub");

  if (res.status === 401) throw authError("GitHub", "token is invalid or expired");
  if (res.status === 403) throw authError("GitHub", "token rejected (check SSO authorization and required scopes: repo, read:org)");
  if (!res.ok) throw apiError("GitHub", res.status, await readDetail(res));

  const data = (await res.json()) as { login?: string; email?: string };
  if (!data.login) throw apiError("GitHub", res.status, "unexpected response (no login)");
  return { identity: data.email ? `${data.login} <${data.email}>` : data.login };
}

async function verifyJira(token: string, config: Record<string, string>): Promise<VerifyResult> {
  const baseUrl = requireConfig(config, "baseUrl", "Jira");
  const email = requireConfig(config, "email", "Jira");
  const url = `${baseUrl.replace(/\/$/, "")}/rest/api/3/myself`;
  const auth = Buffer.from(`${email}:${token}`).toString("base64");

  const res = await safeFetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  }, "Jira");

  if (res.status === 401 || res.status === 403) throw authError("Jira", "email + token rejected by the site");
  if (res.status === 404) throw apiError("Jira", 404, `site URL ${baseUrl} did not respond to /rest/api/3/myself`);
  if (!res.ok) throw apiError("Jira", res.status, await readDetail(res));

  const data = (await res.json()) as { displayName?: string; emailAddress?: string; accountId?: string };
  const identity = data.emailAddress ?? data.displayName ?? data.accountId ?? "unknown";
  return { identity };
}

async function verifyAdo(pat: string, config: Record<string, string>): Promise<VerifyResult> {
  const orgUrl = requireConfig(config, "orgUrl", "Azure DevOps");
  const url = `${orgUrl.replace(/\/$/, "")}/_apis/connectionData?api-version=7.0`;
  const auth = Buffer.from(`:${pat}`).toString("base64");

  const res = await safeFetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  }, "Azure DevOps");

  if (res.status === 401 || res.status === 203) throw authError("Azure DevOps", "PAT rejected by this org (203 means the request was redirected to the sign-in page — token is invalid for this org)");
  if (res.status === 403) throw authError("Azure DevOps", "PAT lacks required scopes for this org");
  if (res.status === 404) throw apiError("Azure DevOps", 404, `org URL ${orgUrl} did not respond to /_apis/connectionData`);
  if (!res.ok) throw apiError("Azure DevOps", res.status, await readDetail(res));

  const data = (await res.json()) as {
    authenticatedUser?: { providerDisplayName?: string; properties?: { Account?: { $value?: string } } };
  };
  const user = data.authenticatedUser;
  const identity = user?.properties?.Account?.$value ?? user?.providerDisplayName ?? "unknown";
  return { identity };
}

async function verifyConfluence(token: string, config: Record<string, string>): Promise<VerifyResult> {
  const baseUrl = requireConfig(config, "baseUrl", "Confluence");
  const email = requireConfig(config, "email", "Confluence");
  const cleaned = baseUrl.replace(/\/$/, "").replace(/\/wiki$/, "");
  const url = `${cleaned}/wiki/rest/api/user/current`;
  const auth = Buffer.from(`${email}:${token}`).toString("base64");

  const res = await safeFetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  }, "Confluence");

  if (res.status === 401 || res.status === 403) throw authError("Confluence", "email + token rejected by the site");
  if (res.status === 404) throw apiError("Confluence", 404, `site URL ${baseUrl} did not respond to /wiki/rest/api/user/current`);
  if (!res.ok) throw apiError("Confluence", res.status, await readDetail(res));

  const data = (await res.json()) as { displayName?: string; email?: string; accountId?: string };
  const identity = data.email ?? data.displayName ?? data.accountId ?? "unknown";
  return { identity };
}

function requireConfig(config: Record<string, string>, key: string, label: string): string {
  const v = config[key]?.trim();
  if (!v) throw new Error(`${label} integration requires \`${key}\``);
  return v;
}

async function safeFetch(url: string, init: RequestInit, label: string): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not reach ${label} (${url}): ${msg}`);
  }
}

async function readDetail(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 200);
  } catch {
    return res.statusText;
  }
}

function authError(label: string, why: string): Error {
  return new Error(`${label} rejected the credentials — ${why}.`);
}

function apiError(label: string, status: number, detail: string): Error {
  return new Error(`${label} verification failed (HTTP ${status}): ${detail}`);
}
