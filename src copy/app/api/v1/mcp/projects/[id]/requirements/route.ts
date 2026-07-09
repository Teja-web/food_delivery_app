/**
 * /api/v1/mcp/projects/[id]/requirements
 *
 * GET  — list "requirement-like" plans (default kind `story`, since
 *        coznt has no `requirement` plan kind).
 * POST — create one or many. Body is either a single object (one plan)
 *        or an array of objects (batch — used by `push_requirements`).
 */

import { z } from "zod/v4";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  projectTasks as plans,
  PLAN_KINDS,
  PLAN_PRIORITIES,
  PLAN_STATUSES,
  type PlanKind,
  type PlanStatus,
} from "@/db/schema/plan/project-task";
import { handleApi } from "@/lib/auth/api-key";
import { httpError, requireProjectScope } from "@/lib/auth/scope";
import { computeNextAction } from "@/lib/agent-context/next-action";
import { createPlan, normalizeProjectTaskMetadata } from "@/operations/plan/plans";

const DEFAULT_KIND: PlanKind = "story";

const requirementInputSchema = z.object({
  kind: z.enum(PLAN_KINDS).optional(),
  title: z.string().min(1),
  summary: z.string().optional(),
  body: z.string().optional().default(""),
  priority: z.enum(PLAN_PRIORITIES).optional(),
  effortEstimate: z.string().optional(),
  assigneeId: z.string().optional(),
  assigneeName: z.string().optional(),
});

const postBodySchema = z.union([
  requirementInputSchema,
  z.array(requirementInputSchema).min(1).max(50),
]);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleApi(req, async (ctx) => {
    const project = await requireProjectScope(ctx, id);

    const url = new URL(req.url);
    const rawKind = url.searchParams.get("kind") ?? DEFAULT_KIND;
    const rawStatus = url.searchParams.get("status");
    const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);

    const kind: PlanKind = PLAN_KINDS.includes(rawKind as PlanKind)
      ? (rawKind as PlanKind)
      : DEFAULT_KIND;
    const limit = Math.min(Number.isFinite(rawLimit) ? rawLimit : 50, 200);
    const status: PlanStatus | null =
      rawStatus && PLAN_STATUSES.includes(rawStatus as PlanStatus)
        ? (rawStatus as PlanStatus)
        : null;

    const where = status
      ? and(
          eq(plans.organizationId, ctx.organizationId),
          eq(plans.projectId, project.id),
          eq(plans.kind, kind),
          eq(plans.status, status),
        )
      : and(
          eq(plans.organizationId, ctx.organizationId),
          eq(plans.projectId, project.id),
          eq(plans.kind, kind),
        );

    const rows = await db.query.projectTasks.findMany({
      where,
      orderBy: [desc(plans.updatedAt)],
      limit,
      columns: {
        id: true,
        title: true,
        summary: true,
        status: true,
        priority: true,
        kind: true,
        assigneeName: true,
        updatedAt: true,
      },
    });

    return {
      project: { id: project.id },
      kind,
      total: rows.length,
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        summary: r.summary,
        status: r.status,
        priority: r.priority,
        kind: r.kind,
        assigneeName: r.assigneeName,
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleApi(req, async (ctx) => {
    const project = await requireProjectScope(ctx, id);

    const parsed = postBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw httpError(400, "Invalid body", parsed.error.issues);
    }

    const list = Array.isArray(parsed.data) ? parsed.data : [parsed.data];

    // createPlan handles slug derivation + validation + hooks (applyRulesToPlan,
    // audit). We sequence rather than Promise.all so a single rule-violation
    // throws cleanly without orphan partial writes — and audit ordering
    // is preserved.
    const created: Array<{ id: string; kind: PlanKind; title: string }> = [];
    for (const item of list) {
      const plan = await createPlan({
        projectId: project.id,
        kind: item.kind ?? DEFAULT_KIND,
        title: item.title,
        summary: item.summary,
        body: item.body ?? "",
        priority: item.priority,
        metadata: normalizeProjectTaskMetadata({ effortEstimate: item.effortEstimate }),
        assigneeId: item.assigneeId,
        assigneeName: item.assigneeName,
      });
      created.push({ id: plan.id, kind: plan.kind, title: plan.title });
    }

    const nextAction = await computeNextAction(ctx.organizationId, project.id);

    return {
      project: { id: project.id },
      batch: Array.isArray(parsed.data),
      created,
      total: created.length,
      nextAction,
    };
  });
}
