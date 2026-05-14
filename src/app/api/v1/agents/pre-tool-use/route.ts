/**
 * POST /api/v1/agents/pre-tool-use
 *
 * Called by IDE plugins (Claude Code, Cursor, …) before an AI agent runs a
 * tool. Resolves the calling skill against the API context, applies
 * action-policy rules, and returns an allow/deny verdict plus the current
 * autonomy level.
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
 *     "reason": "Blocked: dangerous-shell-commands",
 *     "autonomy": { "level": 2, "levelName": "senior", "successRate": 0.94 },
 *     "violations": [...],
 *     "skillId": "..."
 *   }
 */

import { handleApi } from "@/lib/api/auth";
import { handlePreToolUse, preToolUseSchema } from "@/lib/agents/tool-events";

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
