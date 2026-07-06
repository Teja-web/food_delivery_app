import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { buildGitHubAuthorizationUrl, GitHubOAuthError } from "@/operations/integration/github-oauth";

import { getRequestAuthContext } from "../../_auth";

const GITHUB_STATE_COOKIE = "github_oauth_state";

function getRequestOrigin(req: Request): string {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const forwardedHost = req.headers.get("x-forwarded-host");
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return new URL(req.url).origin;
}

function resolveGitHubRedirectUri(req: Request): string {
  const configured = process.env.GITHUB_OAUTH_REDIRECT_URI?.trim();
  if (configured) return configured;
  return `${getRequestOrigin(req)}/api/github/callback`;
}

export async function GET(req: Request) {
  const ctx = await getRequestAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const state = randomUUID();
    const redirectUri = resolveGitHubRedirectUri(req);
    const forceAccountSelect = new URL(req.url).searchParams.get("switch") === "1";
    const url = buildGitHubAuthorizationUrl({ state, redirectUri, forceAccountSelect });

    const response = NextResponse.json({ url });
    response.cookies.set({
      name: GITHUB_STATE_COOKIE,
      value: state,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/github/callback",
      maxAge: 10 * 60,
    });
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not start GitHub OAuth.";
    const status = err instanceof GitHubOAuthError ? err.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
