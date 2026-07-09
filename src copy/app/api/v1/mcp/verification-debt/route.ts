/**
 * GET /api/v1/mcp/verification-debt
 *
 * Verification-debt score for a project. Derived from the audit ledger
 * only — see `docs/product/verification-debt-thesis.md`. Per Decision #1
 * the score is materialized; for now `computeProjectDebt` reads on
 * demand. Wire to the materialized column in `refresh-verification-debt.ts`
 * follow-up.
 *
 * Query params:
 *   - projectId (optional): defaults to ctx.projectId
 */

import { handleApi } from "@/lib/auth/api-key";
import { httpError } from "@/lib/auth/scope";
import { computeProjectDebt } from "@/operations/verification-debt";

export async function GET(req: Request) {
  return handleApi(req, async (ctx) => {
    const url = new URL(req.url);
    const requestedProjectId = url.searchParams.get("projectId");
    const effectiveProjectId = requestedProjectId ?? ctx.projectId;

    if (
      requestedProjectId &&
      ctx.projectId &&
      requestedProjectId !== ctx.projectId
    ) {
      throw httpError(403, "API key scoped to a different project.");
    }

    const breakdown = await computeProjectDebt(effectiveProjectId, ctx.organizationId);
    return { projectId: effectiveProjectId, breakdown };
  });
}
