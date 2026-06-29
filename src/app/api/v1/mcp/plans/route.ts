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
  planArtifacts as plans,
  PLAN_KINDS,
  PLAN_STATUSES,
  type PlanKind,
  type PlanStatus,
} from "@/db/schema/plan/plan-artifact";
import { handleApi } from "@/lib/auth/api-key";
import { httpError, requireProjectScope } from "@/lib/auth/scope";
import { computeNextAction } from "@/lib/agent-context/next-action";
import { pushPlanToJira } from "@/lib/integrations/outbound";
import { upsertPlanByKindAndSlug } from "@/operations/plan/plans";

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
      throw httpError(400, "Invalid body", parsed.error.issues);
    }
    const input = parsed.data;

    const project = await requireProjectScope(ctx, input.projectId);

    const { parentPlanId, ...rest } = input;
    const result = await upsertPlanByKindAndSlug({
      ...rest,
      parentPlanArtifactId: parentPlanId ?? null,
    });
    if (!result.created && result.plan.externalRef?.startsWith("jira:")) {
      await pushPlanToJira(result.plan.id);
    }
    const nextAction = await computeNextAction(ctx.organizationId, project.id);
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
      nextAction,
    };
  });
}

export async function GET(req: Request) {
  return handleApi(req, async (ctx) => {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) throw httpError(400, "`projectId` query param is required");

    const project = await requireProjectScope(ctx, projectId);

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

    const rows = await db.query.planArtifacts.findMany({
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
