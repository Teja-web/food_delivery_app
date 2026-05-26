/**
 * /api/v1/mcp/context — fetch project context (rules, skills, ADRs, phase).
 *
 * Two methods, same payload:
 *  - POST: body `{ repoUrl?, branch?, workItemKey? }` (Cursor MCP server, Devin).
 *  - GET:  query string `?repoUrl=&workItemKey=` (coznt's own MCP tool
 *    `get_my_context` calls this — see `src/mcp/tools/get-my-context.ts`).
 *
 * Auth: bearer API key (project-scoped or org-wide). Org-wide keys must
 * include `repoUrl` to disambiguate.
 */

import { ZodError } from "zod/v4";

import {
  authenticate,
  UnauthorizedError,
  withApiContext,
  type ApiContext,
} from "@/lib/auth/api-key";
import {
  buildMcpContext,
  McpProjectAmbiguousError,
  McpProjectNotFoundError,
} from "@/lib/mcp/build-context";
import { McpRequestSchema } from "@/lib/mcp/schemas";

function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3029";
  return `${base.replace(/\/$/, "")}${path}`;
}

async function authOrError(req: Request): Promise<ApiContext | Response> {
  try {
    return await authenticate(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return Response.json(
        { error: "Invalid or expired API key.", fixUrl: appUrl("/api-keys") },
        { status: 401 },
      );
    }
    return Response.json({ error: "Authentication failed" }, { status: 401 });
  }
}

async function respond(
  ctx: ApiContext,
  input: { repoUrl?: string; workItemKey?: string },
): Promise<Response> {
  try {
    const result = await withApiContext(ctx, async () =>
      buildMcpContext({
        organizationId: ctx.organizationId,
        keyProjectId: ctx.projectId,
        repoUrl: input.repoUrl,
        workItemKey: input.workItemKey,
      }),
    );
    return Response.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof McpProjectAmbiguousError) {
      return Response.json(
        { error: err.message, candidates: err.details.candidates },
        { status: 409 },
      );
    }
    if (err instanceof McpProjectNotFoundError) {
      return Response.json(
        { error: err.message, fixUrl: err.details.fixUrl },
        { status: 404 },
      );
    }
    const msg = err instanceof Error ? err.message : "Internal error";
    return Response.json(
      {
        error: `coznt is up but something failed while assembling context: ${msg}`,
        fixUrl: appUrl("/api-keys"),
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const auth = await authOrError(req);
  if (auth instanceof Response) return auth;

  let body: { repoUrl?: string; branch?: string; workItemKey?: string } = {};
  try {
    const raw = await req.text();
    if (raw.trim().length > 0) {
      body = McpRequestSchema.parse(JSON.parse(raw));
    }
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json(
        { error: "Invalid request body", details: err.issues },
        { status: 400 },
      );
    }
    return Response.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  return respond(auth, { repoUrl: body.repoUrl, workItemKey: body.workItemKey });
}

export async function GET(req: Request) {
  const auth = await authOrError(req);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const repoUrl = url.searchParams.get("repoUrl") ?? undefined;
  const workItemKey = url.searchParams.get("workItemKey") ?? undefined;

  try {
    McpRequestSchema.parse({ repoUrl, workItemKey });
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json(
        { error: "Invalid query params", details: err.issues },
        { status: 400 },
      );
    }
    throw err;
  }

  return respond(auth, { repoUrl, workItemKey });
}
