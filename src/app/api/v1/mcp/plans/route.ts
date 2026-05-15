/**
 * /api/v1/mcp/plans
 *
 * GET  — list plans for a project with optional kind / status / slug filters.
 *        Metadata only by default; `includeBody=true` embeds bodies.
 * POST — upsert by `(projectId, kind, slug)`. New plans land in `draft`;
 *        existing plans get a new revision row with refreshed body/title/
 *        summary. Used by the `upsert_plan` MCP verb to land AI-authored
 *        artifacts (test plans, release notes, storyboards, etc.).
 */

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/db/client";
import {
  plans,
  PLAN_KINDS,
  PLAN_STATUSES,
  type PlanKind,
  type PlanStatus,
} from "@/db/schema/plan";
import { projects } from "@/db/schema/project";
import { handleApi } from "@/lib/auth/api-key";
import { upsertPlanByKindAndSlug } from "@/operations/plans";

const upsertBodySchema = z.object({
  projectId: z.string().min(1),
  kind: z.enum(PLAN_KINDS),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "slug must be lowercase alphanumerics + hyphens"),
  title: z.string().min(1),
  summary: z.string().optional(),
  body: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
  parentPlanId: z.string().optional().nullable(),
  changeNote: z.string().optional(),
});

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const parsed = upsertBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const err = new Error("Invalid body") as Error & { status?: number; details?: unknown };
      err.status = 400;
      err.details = parsed.error.issues;
      throw err;
    }
    const input = parsed.data;

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, input.projectId), eq(projects.organizationId, ctx.organizationId)),
      columns: { id: true },
    });
    if (!project) {
      const err = new Error("Project not found") as Error & { status?: number };
      err.status = 404;
      throw err;
    }
    if (ctx.projectId && ctx.projectId !== project.id) {
      const err = new Error("API key scoped to a different project.") as Error & { status?: number };
      err.status = 403;
      throw err;
    }

    const result = await upsertPlanByKindAndSlug(input);
    return {
      plan: {
        id: result.plan.id,
        kind: result.plan.kind,
        slug: result.plan.slug,
        title: result.plan.title,
        status: result.plan.status,
        updatedAt: result.plan.updatedAt,
      },
      revisionNumber: result.revisionNumber,
      created: result.created,
    };
  });
}

export async function GET(req: Request) {
  return handleApi(req, async (ctx) => {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) {
      const err = new Error("`projectId` query param is required") as Error & { status?: number };
      err.status = 400;
      throw err;
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.organizationId, ctx.organizationId)),
      columns: { id: true },
    });
    if (!project) {
      const err = new Error("Project not found") as Error & { status?: number };
      err.status = 404;
      throw err;
    }
    if (ctx.projectId && ctx.projectId !== project.id) {
      const err = new Error("API key scoped to a different project.") as Error & { status?: number };
      err.status = 403;
      throw err;
    }

    const rawKind = url.searchParams.get("kind");
    const rawStatus = url.searchParams.get("status");
    const rawSlug = url.searchParams.get("slug");
    const includeBody = url.searchParams.get("includeBody") === "true";
    const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
    const limit = Math.min(Number.isFinite(rawLimit) ? rawLimit : 50, 200);

    const kind = rawKind && PLAN_KINDS.includes(rawKind as PlanKind) ? (rawKind as PlanKind) : null;
    const status =
      rawStatus && PLAN_STATUSES.includes(rawStatus as PlanStatus) ? (rawStatus as PlanStatus) : null;

    const conditions = [
      eq(plans.organizationId, ctx.organizationId),
      eq(plans.projectId, project.id),
    ];
    if (kind) conditions.push(eq(plans.kind, kind));
    if (status) conditions.push(eq(plans.status, status));
    if (rawSlug) conditions.push(eq(plans.slug, rawSlug));

    const rows = await db.query.plans.findMany({
      where: and(...conditions),
      orderBy: [desc(plans.updatedAt)],
      limit,
      columns: {
        id: true,
        kind: true,
        slug: true,
        title: true,
        summary: true,
        status: true,
        priority: true,
        assigneeName: true,
        updatedAt: true,
        ...(includeBody ? { body: true } : {}),
      },
    });

    return {
      project: { id: project.id },
      filters: { kind, status, slug: rawSlug, includeBody },
      total: rows.length,
      items: rows,
    };
  });
}
