/**
 * POST /api/v1/mcp/governance/request-exception
 *
 * Open a pending exception governance_record that supersedes a failing
 * or pending record. Backs the `request_exception` MCP verb.
 */

import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { governanceRecords } from "@/db/schema/governance/records";
import { handleApi } from "@/lib/auth/api-key";
import { httpError } from "@/lib/auth/scope";
import { governanceRecordCrud } from "@/operations/governance/records";

const bodySchema = z.object({
  governanceRecordId: z.string().min(1),
  reason: z.string().min(1),
  expiresAt: z.string().min(1),
});

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      throw httpError(400, "Invalid body", parsed.error.issues);
    }

    const supersedes = await db.query.governanceRecords.findFirst({
      where: and(
        eq(governanceRecords.id, parsed.data.governanceRecordId),
        eq(governanceRecords.organizationId, ctx.organizationId),
      ),
    });
    if (!supersedes) throw httpError(404, "governance_record not found");
    if (ctx.projectId && ctx.projectId !== supersedes.projectId) {
      throw httpError(403, "API key scoped to a different project.");
    }

    const row = await governanceRecordCrud.create({
      projectId: supersedes.projectId,
      projectTaskId: supersedes.projectTaskId,
      kind: "exception",
      status: "pending",
      details: {
        reason: parsed.data.reason,
        supersedesRecordId: supersedes.id,
        expiresAt: parsed.data.expiresAt,
      },
    });

    return { exception: row };
  });
}
