/**
 * PATCH /api/v1/mcp/work-items/[id]
 *
 * Update a work_item's status (and optionally assignee). Coznt-side
 * only — does NOT push the change to the upstream system (GitHub /
 * Jira / ADO). That's `push_to_external`'s job, and is intentionally
 * separate so the coznt record can drift forward of upstream when an
 * agent is mid-flow.
 *
 * Auth: bearer API key. Caller must share an org with the work_item.
 */

import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { workItems } from "@/db/schema/work-item";
import { handleApi } from "@/lib/api/auth";
import { workItemCrud } from "@/operations/work-items";

const bodySchema = z.object({
  status: z.string().min(1).optional(),
  assigneeEmail: z.string().email().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleApi(req, async (ctx) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const err = new Error("Invalid body") as Error & { status?: number; details?: unknown };
      err.status = 400;
      err.details = parsed.error.issues;
      throw err;
    }
    if (parsed.data.status === undefined && parsed.data.assigneeEmail === undefined) {
      const err = new Error("Nothing to update — provide status or assigneeEmail.") as Error & {
        status?: number;
      };
      err.status = 400;
      throw err;
    }

    const existing = await db.query.workItems.findFirst({
      where: and(eq(workItems.id, id), eq(workItems.organizationId, ctx.organizationId)),
    });
    if (!existing) {
      const err = new Error("Work item not found") as Error & { status?: number };
      err.status = 404;
      throw err;
    }
    if (ctx.projectId && existing.projectId && ctx.projectId !== existing.projectId) {
      const err = new Error("API key scoped to a different project.") as Error & { status?: number };
      err.status = 403;
      throw err;
    }

    const updated = await workItemCrud.update(id, {
      status: parsed.data.status ?? existing.status ?? undefined,
      assigneeEmail: parsed.data.assigneeEmail ?? existing.assigneeEmail ?? undefined,
    });

    return {
      id: updated.id,
      status: updated.status,
      assigneeEmail: updated.assigneeEmail,
      source: updated.source,
      externalId: updated.externalId,
      note: "Coznt-side update only. Use `push_to_external` (when implemented) to sync upstream.",
    };
  });
}
