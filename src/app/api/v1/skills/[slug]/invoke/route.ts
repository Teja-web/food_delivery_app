import { handleApi } from "@/lib/auth/api-key";
import { enforceWriteVerbFromHeader } from "@/lib/auth/repo-policy";
import { invokeSkill } from "@/operations/skill-invocation";

/**
 * POST /api/v1/skills/:slug/invoke
 *
 * Body:
 *   {
 *     "input": {...},              // freeform; skill's own inputSchema documents shape
 *     "entityType": "plan",        // optional — files the result against an entity
 *     "entityId": "abc123",
 *     "model": "gpt-4o-mini"       // optional override
 *   }
 *
 * Returns: { skillId, runId, output, text, durationMs, intelligenceId }
 *
 * Repo policy: enforced via the `X-Coznt-Repo-Url` header. `deny` rejects;
 * `read-only` denies this verb (it's in WRITE_VERBS). Read-write or no
 * header passes through.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handleApi(req, async (ctx) => {
    await enforceWriteVerbFromHeader(req, ctx.organizationId, "invoke_skill");
    const body = await req.json().catch(() => ({}));
    return invokeSkill({
      slug,
      input: body?.input ?? {},
      entityType: body?.entityType,
      entityId: body?.entityId,
      model: body?.model,
    });
  });
}
