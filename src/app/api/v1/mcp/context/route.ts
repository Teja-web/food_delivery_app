/**
 * POST /api/v1/mcp/context
 *
 * Cursor's MCP server calls this endpoint to fetch the project context
 * (rules, skills, ADRs, current phase) for the repo Devin is editing.
 *
 * Auth: bearer API key (project-scoped or org-wide). Org-wide keys must
 * include `repoUrl` to disambiguate.
 */

import { ZodError } from "zod/v4";

import {
  authenticate,
  UnauthorizedError,
  withApiContext,
} from "@/lib/api/auth";
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

export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await authenticate(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return Response.json(
        {
          error: "Invalid or expired API key.",
          fixUrl: appUrl("/api-keys"),
        },
        { status: 401 },
      );
    }
    return Response.json({ error: "Authentication failed" }, { status: 401 });
  }

  let body: { repoUrl?: string; branch?: string; workItemKey?: string } = {};
  try {
    const raw = await req.text();
    if (raw.trim().length > 0) {
      const parsed = McpRequestSchema.parse(JSON.parse(raw));
      body = parsed;
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

  try {
    const result = await withApiContext(ctx, async () =>
      buildMcpContext({
        organizationId: ctx.organizationId,
        keyProjectId: ctx.projectId,
        repoUrl: body.repoUrl,
        workItemKey: body.workItemKey,
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
    // Never bare 500 — always surface a recovery affordance.
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
