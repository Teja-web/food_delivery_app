import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "@/db/client";
import { oauthConnections } from "@/db/schema/integrations";
import { decrypt, encrypt } from "@/lib/integrations/encryption";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_OAUTH_BASE = "https://github.com/login/oauth";
const GITHUB_PROVIDER = "github";
const GITHUB_CATEGORY = "scm";
const GITHUB_SCOPE = "repo";

function getGitHubOAuthClientId(): string | undefined {
  return process.env.GITHUB_OAUTH_CLIENT_ID || process.env.GITHUB_CLIENT_ID;
}

function getGitHubOAuthClientSecret(): string | undefined {
  return process.env.GITHUB_OAUTH_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET;
}

interface GithubTokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GithubUserResponse {
  login: string;
  name: string | null;
  email: string | null;
  avatar_url?: string;
}

interface GithubRepoResponse {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: { login: string };
  clone_url: string;
  html_url: string;
}

export interface GitHubRepositorySummary {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  repoName: string;
  cloneUrl: string;
  htmlUrl: string;
  private: boolean;
}

export interface GitHubAccountProfile {
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

export class GitHubOAuthError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "GitHubOAuthError";
    this.status = status;
  }
}

export function buildGitHubAuthorizationUrl(input: {
  state: string;
  redirectUri: string;
  forceAccountSelect?: boolean;
}): string {
  const clientId = getGitHubOAuthClientId();
  if (!clientId) {
    throw new GitHubOAuthError("GitHub OAuth is not configured.", 500);
  }

  const url = new URL(`${GITHUB_OAUTH_BASE}/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", GITHUB_SCOPE);
  url.searchParams.set("state", input.state);
  if (input.forceAccountSelect) {
    // GitHub may still reuse browser auth state, but this nudges re-selection where supported.
    url.searchParams.set("prompt", "select_account");
  }
  return url.toString();
}

export async function exchangeGitHubCodeForToken(input: {
  code: string;
  state: string;
  redirectUri: string;
}): Promise<{ accessToken: string; refreshToken?: string; scopes: string[]; expiresAt?: string }> {
  const clientId = getGitHubOAuthClientId();
  const clientSecret = getGitHubOAuthClientSecret();
  if (!clientId || !clientSecret) {
    throw new GitHubOAuthError("GitHub OAuth is not configured.", 500);
  }

  const response = await fetch(`${GITHUB_OAUTH_BASE}/access_token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      state: input.state,
    }),
  });

  const payload = (await response.json()) as GithubTokenResponse;
  if (!response.ok || payload.error || !payload.access_token) {
    throw new GitHubOAuthError(
      payload.error_description || payload.error || "Failed to exchange GitHub OAuth code.",
      400,
    );
  }

  const scopes = (payload.scope ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const expiresAt =
    typeof payload.expires_in === "number" ? new Date(Date.now() + payload.expires_in * 1000).toISOString() : undefined;

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    scopes,
    expiresAt,
  };
}

export async function upsertGitHubConnection(input: {
  organizationId: string;
  userId: string;
  accessToken: string;
  refreshToken?: string;
  scopes: string[];
  tokenExpiresAt?: string;
}): Promise<void> {
  const user = await githubRequest<GithubUserResponse>("/user", input.accessToken);
  const now = new Date().toISOString();

  await db
    .insert(oauthConnections)
    .values({
      id: nanoid(),
      organizationId: input.organizationId,
      userId: input.userId,
      provider: GITHUB_PROVIDER,
      category: GITHUB_CATEGORY,
      status: "active",
      accountEmail: user.email,
      accountName: user.login || user.name,
      scopes: input.scopes,
      accessTokenEncrypted: encrypt(input.accessToken),
      refreshTokenEncrypted: input.refreshToken ? encrypt(input.refreshToken) : null,
      tokenType: "Bearer",
      tokenExpiresAt: input.tokenExpiresAt,
      connectedAt: now,
      lastUsedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        oauthConnections.organizationId,
        oauthConnections.userId,
        oauthConnections.provider,
      ],
      set: {
        status: "active",
        accountEmail: user.email,
        accountName: user.login || user.name,
        scopes: input.scopes,
        accessTokenEncrypted: encrypt(input.accessToken),
        refreshTokenEncrypted: input.refreshToken ? encrypt(input.refreshToken) : null,
        tokenType: "Bearer",
        tokenExpiresAt: input.tokenExpiresAt,
        lastUsedAt: now,
        updatedAt: now,
      },
    });
}

export async function getGitHubAccountProfile(input: {
  organizationId: string;
  userId: string;
}): Promise<GitHubAccountProfile> {
  const token = await getGitHubAccessToken(input);
  if (!token) {
    throw new GitHubOAuthError("GitHub is not connected for this user.", 401);
  }
  const user = await githubRequest<GithubUserResponse>("/user", token);
  await touchGitHubConnection(input);
  return {
    login: user.login,
    name: user.name,
    avatarUrl: user.avatar_url ?? null,
  };
}

export async function disconnectGitHubConnection(input: {
  organizationId: string;
  userId: string;
}): Promise<void> {
  await db
    .delete(oauthConnections)
    .where(
      and(
        eq(oauthConnections.organizationId, input.organizationId),
        eq(oauthConnections.userId, input.userId),
        eq(oauthConnections.provider, GITHUB_PROVIDER),
      ),
    );
}

export async function getGitHubAccessToken(input: {
  organizationId: string;
  userId: string;
}): Promise<string | null> {
  const row = await db.query.oauthConnections.findFirst({
    where: and(
      eq(oauthConnections.organizationId, input.organizationId),
      eq(oauthConnections.userId, input.userId),
      eq(oauthConnections.provider, GITHUB_PROVIDER),
    ),
    columns: {
      accessTokenEncrypted: true,
      status: true,
    },
  });

  if (!row || row.status !== "active") return null;
  try {
    return decrypt(row.accessTokenEncrypted);
  } catch {
    return null;
  }
}

export async function listGitHubRepositories(input: {
  organizationId: string;
  userId: string;
}): Promise<GitHubRepositorySummary[]> {
  const token = await getGitHubAccessToken(input);
  if (!token) {
    throw new GitHubOAuthError("GitHub is not connected for this user.", 401);
  }

  const repos = await githubRequest<GithubRepoResponse[]>(
    "/user/repos?per_page=100&sort=updated&type=owner",
    token,
  );
  await touchGitHubConnection(input);
  return repos.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
    repoName: repo.name,
    cloneUrl: repo.clone_url,
    htmlUrl: repo.html_url,
    private: repo.private,
  }));
}

export async function createGitHubRepository(input: {
  organizationId: string;
  userId: string;
  name: string;
  description?: string;
  isPrivate?: boolean;
}): Promise<GitHubRepositorySummary> {
  const repoName = input.name.trim();
  if (!repoName) {
    throw new GitHubOAuthError("Repository name is required.", 400);
  }

  const token = await getGitHubAccessToken(input);
  if (!token) {
    throw new GitHubOAuthError("GitHub is not connected for this user.", 401);
  }

  const repo = await githubRequest<GithubRepoResponse>("/user/repos", token, {
    method: "POST",
    body: JSON.stringify({
      name: repoName,
      description: input.description?.trim() || undefined,
      private: input.isPrivate ?? true,
      auto_init: true,
    }),
  });
  await touchGitHubConnection(input);
  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
    repoName: repo.name,
    cloneUrl: repo.clone_url,
    htmlUrl: repo.html_url,
    private: repo.private,
  };
}

async function touchGitHubConnection(input: { organizationId: string; userId: string }) {
  await db
    .update(oauthConnections)
    .set({ lastUsedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(oauthConnections.organizationId, input.organizationId),
        eq(oauthConnections.userId, input.userId),
        eq(oauthConnections.provider, GITHUB_PROVIDER),
      ),
    );
}

async function githubRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const payload = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    const msg =
      typeof (payload as { message?: unknown }).message === "string"
        ? ((payload as { message: string }).message as string)
        : "GitHub API request failed.";
    const status = response.status === 401 ? 401 : 502;
    throw new GitHubOAuthError(msg, status);
  }
  return payload as T;
}
