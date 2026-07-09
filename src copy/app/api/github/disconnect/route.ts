import { NextResponse } from "next/server";

import {
  disconnectGitHubConnection,
  GitHubOAuthError,
} from "@/operations/integration/github-oauth";

import { getRequestAuthContext } from "../_auth";

export async function POST() {
  const ctx = await getRequestAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await disconnectGitHubConnection(ctx);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not disconnect GitHub.";
    const status = err instanceof GitHubOAuthError ? err.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
