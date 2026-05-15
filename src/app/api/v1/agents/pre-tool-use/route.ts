/**
 * POST /api/v1/agents/pre-tool-use
 *
 * Called by IDE plugins (Claude Code, Cursor, …) before an AI agent runs a
 * tool. Resolves the calling skill against the API context, applies
 * action-policy rules AND the Milestone-D autonomy threshold gate, and
 * returns an allow/deny verdict. When the autonomy gate blocks, the
 * response includes the id of a freshly-opened `skill_invocation` approval.
 *
 * Request body (validated by `preToolUseSchema`):
 *
 *   {
 *     "skillSlug": "change-risk-classifier",
 *     "tool": "bash",
 *     "command": "rm -rf node_modules",   // optional
 *     "paths": ["src/foo.ts"],            // optional
 *     "fileCount": 1,                     // optional
 *     "hasTests": false,                  // optional
 *     "sessionId": "...",                 // optional, opaque to coznt
 *     "runId": "...",                     // optional; auto-generated if omitted
 *     "projectId": "..."                  // optional, falls back to API key's project
 *   }
 *
 * Response:
 *
 *   {
 *     "allowed": false,
 *     "runId": "...",
 *     "reason": "autonomy_gate: skill at level 0 but 2 required",
 *     "autonomy": { "level": 0, "levelName": "intern", "requiredLevel": 2 },
 *     "approvalId": "appr_...",
 *     "violations": [],
 *     "skillId": "..."
 *   }
 */

import { handleApi } from "@/lib/auth/api-key";
import { handlePreToolUse, preToolUseSchema } from "@/operations/tool-events";

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const body = await req.json().catch(() => ({}));
    const parsed = preToolUseSchema.safeParse(body);
    if (!parsed.success) {
      const err = new Error("Invalid PreToolUse payload") as Error & {
        status?: number;
        details?: unknown;
      };
      err.status = 400;
      err.details = parsed.error.issues;
      throw err;
    }
    return handlePreToolUse(ctx, parsed.data);
  });
}
