import { NextResponse } from "next/server";

import {
  createGitHubRepository,
  GitHubOAuthError,
  listGitHubRepositories,
} from "@/operations/integration/github-oauth";

import { getRequestAuthContext } from "../_auth";

interface CreateRepoBody {
  name?: string;
  description?: string;
  private?: boolean;
}

export async function GET() {
  const ctx = await getRequestAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const repos = await listGitHubRepositories(ctx);
    return NextResponse.json({ repositories: repos });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load GitHub repositories.";
    const status = err instanceof GitHubOAuthError ? err.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  const ctx = await getRequestAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateRepoBody;
  try {
    body = (await req.json()) as CreateRepoBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const repository = await createGitHubRepository({
      ...ctx,
      name: body.name?.trim() || "",
      description: body.description?.trim() || undefined,
      isPrivate: body.private ?? true,
    });
    return NextResponse.json({ repository }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create GitHub repository.";
    const status = err instanceof GitHubOAuthError ? err.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
