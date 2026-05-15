/**
 * POST /api/v1/mcp/projects/resolve
 *
 * Fuzzy-match a project for the calling API key's org. Used by the
 * MCP `set_project` / `switch_project` tools to bind a project to the
 * agent's session.
 *
 * Resolution order (first match wins):
 *   1. exact id match
 *   2. exact slug match (case-insensitive)
 *   3. exact name match (case-insensitive)
 *   4. substring slug match
 *   5. substring name match
 *
 * Returns 200 with the resolved project, 404 with the candidate list
 * when nothing matches, 409 with candidates when the query is
 * ambiguous (multiple substring matches and no exact hit).
 */

import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { projects } from "@/db/schema/project";
import { handleApi } from "@/lib/auth/api-key";

const bodySchema = z.object({
  query: z.string().min(1).describe("Project id, slug, name, or substring."),
});

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const err = new Error("Invalid body") as Error & { status?: number; details?: unknown };
      err.status = 400;
      err.details = parsed.error.issues;
      throw err;
    }

    const q = parsed.data.query.trim();
    const qLower = q.toLowerCase();

    // Pull every project in the org once — orgs have <100 projects in
    // practice, so a single fetch + in-memory match is simpler than
    // composing five separate queries.
    const orgProjects = await db.query.projects.findMany({
      where: eq(projects.organizationId, ctx.organizationId),
      columns: { id: true, name: true, slug: true, phase: true },
    });

    const exactId = orgProjects.find((p) => p.id === q);
    if (exactId) return projectResponse(exactId);

    const exactSlug = orgProjects.find((p) => p.slug.toLowerCase() === qLower);
    if (exactSlug) return projectResponse(exactSlug);

    const exactName = orgProjects.find((p) => p.name.toLowerCase() === qLower);
    if (exactName) return projectResponse(exactName);

    const substring = orgProjects.filter(
      (p) =>
        p.slug.toLowerCase().includes(qLower) || p.name.toLowerCase().includes(qLower),
    );
    if (substring.length === 1) return projectResponse(substring[0]);

    if (substring.length > 1) {
      const err = new Error(
        `Multiple projects match "${q}". Use the slug or id to disambiguate.`,
      ) as Error & { status?: number; details?: unknown };
      err.status = 409;
      err.details = {
        candidates: substring.map((p) => ({ id: p.id, name: p.name, slug: p.slug })),
      };
      throw err;
    }

    const err = new Error(
      `No project matches "${q}". Available: ${orgProjects.map((p) => p.slug).join(", ") || "(none)"}.`,
    ) as Error & { status?: number; details?: unknown };
    err.status = 404;
    err.details = {
      candidates: orgProjects.map((p) => ({ id: p.id, name: p.name, slug: p.slug })),
    };
    throw err;

    // unreachable
  });
}

function projectResponse(p: { id: string; name: string; slug: string; phase: string }) {
  return { id: p.id, name: p.name, slug: p.slug, phase: p.phase };
}
