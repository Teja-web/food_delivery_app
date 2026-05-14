/**
 * POST /api/v1/audit/verify
 *
 * Walks the org's audit-log hash chain and returns the first divergence
 * (if any). Operators run this on demand during compliance review; the
 * /audit UI surfaces a "Verify chain" button that hits the same endpoint.
 *
 * Response shape:
 *   - on success: { ok: true, checked, firstAt, lastAt }
 *   - on drift:   { ok: false, checked, drift: { rowId, reason, ... } }
 */

import { handleApi } from "@/lib/api/auth";
import { verifyAuditChain } from "@/operations/audit-chain";

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const url = new URL(req.url);
    const limit = Math.min(50_000, Number(url.searchParams.get("limit") ?? 5_000));
    return verifyAuditChain({ organizationId: ctx.organizationId, limit });
  });
}
