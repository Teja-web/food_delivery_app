/**
 * POST /api/v1/mcp/projects/resolve
 *
 * Fuzzy-match a project within the API key's org by id / slug / name. Used
 * by the `set_project` and `switch_project` MCP verbs to bind a session
 * without the agent needing to know the canonical id.
 *
 * Matching precedence (first hit wins):
 *   1. Exact id match.
 *   2. Exact slug match (case-insensitive).
 *   3. Exact name match (case-insensitive).
 *   4. Substring slug match — only if it resolves a single candidate.
 *   5. Substring name match — only if it resolves a single candidate.
 *
 * Returns 404 when no match, 409 when an ambiguous substring would match
 * multiple projects (the agent should re-try with a more specific query).
 */

import { z } from "zod/v4";
import { and, eq, ilike, or } from "drizzle-orm";

import { authenticate, UnauthorizedError, withApiContext, type ApiContext } from "@/lib/auth/api-key";
import { db } from "@/db/client";
import { projects } from "@/db/schema/project";

const resolveSchema = z.object({
  query: z.string().min(1, "query must be a non-empty id, slug, or name"),
});

interface ResolvedProject {
  id: string;
  name: string;
  slug: string;
}

async function resolve(
  ctx: ApiContext,
  query: string,
): Promise<ResolvedProject | { ambiguous: ResolvedProject[] } | null> {
  const q = query.trim();
  if (!q) return null;
  const qLower = q.toLowerCase();

  return withApiContext(ctx, async () => {
    const exact = await db.query.projects.findFirst({
      where: and(
        eq(projects.organizationId, ctx.organizationId),
        or(eq(projects.id, q), eq(projects.slug, qLower), eq(projects.name, q)),
      ),
      columns: { id: true, name: true, slug: true },
    });
    if (exact) return exact as ResolvedProject;

    const fuzzyMatches = await db.query.projects.findMany({
      where: and(
        eq(projects.organizationId, ctx.organizationId),
        or(ilike(projects.slug, `%${qLower}%`), ilike(projects.name, `%${qLower}%`)),
      ),
      columns: { id: true, name: true, slug: true },
      limit: 6,
    });

    if (fuzzyMatches.length === 0) return null;
    if (fuzzyMatches.length === 1) return fuzzyMatches[0] as ResolvedProject;
    return { ambiguous: fuzzyMatches as ResolvedProject[] };
  });
}

export async function POST(req: Request) {
  let ctx: ApiContext;
  try {
    ctx = await authenticate(req);
  } catch (err) {
    const status = err instanceof UnauthorizedError ? 401 : 401;
    return Response.json({ error: "Invalid or expired API key." }, { status });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = resolveSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await resolve(ctx, parsed.data.query);
  if (result === null) {
    return Response.json(
      { error: `No project matched "${parsed.data.query}" in this organization.` },
      { status: 404 },
    );
  }
  if ("ambiguous" in result) {
    return Response.json(
      {
        error: `"${parsed.data.query}" matched ${result.ambiguous.length} projects — try a more specific id, slug, or name.`,
        candidates: result.ambiguous,
      },
      { status: 409 },
    );
  }
  return Response.json({ project: result });
}
