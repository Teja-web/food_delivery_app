/**
 * PATCH /api/v1/mcp/work-items/[id]
 *
 * Update a work_item's status (and optionally assignee). Always updates the
 * coznt-side row; when the work item is sourced from Jira AND the project
 * has a Jira binding, also fires a best-effort transition upstream so the
 * external system stays in sync. ADO and Confluence syncing follows the
 * same pattern via the outbound module as those paths land.
 *
 * Auth: bearer API key. Caller must share an org with the work_item.
 */

import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { workItems } from "@/db/schema/work-item";
import { handleApi } from "@/lib/auth/api-key";
import { workItemCrud } from "@/operations/work-items";
import { syncWorkItemStatusToJira } from "@/lib/integrations/outbound";

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

    // Best-effort upstream sync for Jira-sourced rows. Only fires when the
    // status actually changed and the project has a Jira binding; no-ops
    // otherwise. Errors are logged inside the helper and never thrown.
    let upstream: { provider: string; transition: string } | null = null;
    if (
      parsed.data.status !== undefined &&
      parsed.data.status !== existing.status &&
      updated.source === "jira"
    ) {
      const result = await syncWorkItemStatusToJira(ctx.organizationId, updated.id);
      if (result) upstream = { provider: "jira", transition: result.name };
    }

    return {
      id: updated.id,
      status: updated.status,
      assigneeEmail: updated.assigneeEmail,
      source: updated.source,
      externalId: updated.externalId,
      upstream,
    };
  });
}
