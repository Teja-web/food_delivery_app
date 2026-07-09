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
import { httpError } from "@/lib/auth/scope";
import { workItemCrud } from "@/operations/work/work-items";
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
      throw httpError(400, "Invalid body", parsed.error.issues);
    }
    if (parsed.data.status === undefined && parsed.data.assigneeEmail === undefined) {
      throw httpError(400, "Nothing to update — provide status or assigneeEmail.");
    }

    const existing = await db.query.workItems.findFirst({
      where: and(eq(workItems.id, id), eq(workItems.organizationId, ctx.organizationId)),
    });
    if (!existing) throw httpError(404, "Work item not found");
    if (ctx.projectId && existing.projectId && ctx.projectId !== existing.projectId) {
      throw httpError(403, "API key scoped to a different project.");
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
