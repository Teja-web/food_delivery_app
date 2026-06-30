import { NextResponse } from "next/server";

import {
  getGitHubAccountProfile,
  GitHubOAuthError,
} from "@/operations/integration/github-oauth";

import { getRequestAuthContext } from "../_auth";

export async function GET() {
  const ctx = await getRequestAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const profile = await getGitHubAccountProfile(ctx);
    return NextResponse.json({ profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load GitHub profile.";
    const status = err instanceof GitHubOAuthError ? err.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
