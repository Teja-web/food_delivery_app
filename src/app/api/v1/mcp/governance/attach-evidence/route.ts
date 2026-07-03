/**
 * POST /api/v1/mcp/governance/attach-evidence
 *
 * Attach proof to a project_task. Backs the `attach_evidence` MCP verb.
 */

import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { projectTasks } from "@/db/schema/plan/project-task";
import { EVIDENCE_TYPES, EVIDENCE_ROLES } from "@/db/schema/evidence";
import { handleApi } from "@/lib/auth/api-key";
import { httpError } from "@/lib/auth/scope";
import { attachEvidence } from "@/operations/evidence";

const bodySchema = z
  .object({
    projectTaskId: z.string().min(1),
    evidenceType: z.enum(EVIDENCE_TYPES),
    evidenceId: z.string().optional(),
    externalUrl: z.string().url().optional(),
    role: z.enum(EVIDENCE_ROLES).optional(),
    note: z.string().optional(),
  })
  .refine((v) => v.evidenceType === "external_link" ? !!v.externalUrl : !!v.evidenceId || !!v.externalUrl, {
    message: "external_link requires externalUrl; other types require evidenceId or externalUrl",
  });

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      throw httpError(400, "Invalid body", parsed.error.issues);
    }

    const plan = await db.query.projectTasks.findFirst({
      where: and(
        eq(projectTasks.id, parsed.data.projectTaskId),
        eq(projectTasks.organizationId, ctx.organizationId),
      ),
    });
    if (!plan) throw httpError(404, "Plan not found");
    if (ctx.projectId && ctx.projectId !== plan.projectId) {
      throw httpError(403, "API key scoped to a different project.");
    }

    const row = await attachEvidence({
      projectId: plan.projectId,
      projectTaskId: plan.id,
      evidenceType: parsed.data.evidenceType,
      evidenceId: parsed.data.evidenceId,
      externalUrl: parsed.data.externalUrl,
      role: parsed.data.role,
      note: parsed.data.note,
    });

    return { evidenceLink: row };
  });
}
