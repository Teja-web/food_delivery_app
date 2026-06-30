import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  exchangeGitHubCodeForToken,
  GitHubOAuthError,
  upsertGitHubConnection,
} from "@/operations/integration/github-oauth";

import { getRequestAuthContext } from "../_auth";

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

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function popupResponse(status: "success" | "error", message?: string, httpStatus?: number): NextResponse {
  const payload = JSON.stringify(
    status === "success"
      ? { type: "github-oauth-success" as const }
      : { type: "github-oauth-error" as const, error: message || "OAuth failed." },
  );
  const safeMessage = escapeHtml(message || "");
  const html = `<!doctype html>
<html>
  <body>
    <script>
      (function () {
        const payload = ${payload};
        if (window.opener) {
          window.opener.postMessage(payload, window.location.origin);
          window.close();
          return;
        }
      })();
    </script>
    <p>${status === "success" ? "GitHub connected. You can close this window." : `GitHub connection failed: ${safeMessage}`}</p>
  </body>
</html>`;

  const response = new NextResponse(html, {
    status: httpStatus ?? (status === "success" ? 200 : 400),
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  response.cookies.set({
    name: GITHUB_STATE_COOKIE,
    value: "",
    path: "/api/github/callback",
    maxAge: 0,
  });
  return response;
}

export async function GET(req: Request) {
  const ctx = await getRequestAuthContext();
  if (!ctx) {
    return popupResponse("error", "Unauthorized");
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription = url.searchParams.get("error_description");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GITHUB_STATE_COOKIE)?.value;

  if (oauthError) {
    return popupResponse("error", oauthErrorDescription || oauthError);
  }
  if (!code || !state || !expectedState || expectedState !== state) {
    return popupResponse("error", "OAuth state mismatch. Please try again.");
  }

  try {
    const redirectUri = resolveGitHubRedirectUri(req);
    const token = await exchangeGitHubCodeForToken({ code, state, redirectUri });
    await upsertGitHubConnection({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      scopes: token.scopes,
      tokenExpiresAt: token.expiresAt,
    });
    return popupResponse("success");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not complete GitHub OAuth.";
    const status = err instanceof GitHubOAuthError ? err.status : 400;
    return popupResponse("error", message, status);
  }
}
