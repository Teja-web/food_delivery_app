/**
 * POST /api/v1/agents/post-tool-use
 *
 * Called by IDE plugins after an AI agent's tool call returns. Records the
 * outcome to `skill_outcomes` (Milestone-A ledger) and, optionally, stores
 * the structured result under `intelligence` keyed by the skill.
 *
 * Request body (validated by `postToolUseSchema`):
 *
 *   {
 *     "skillSlug": "change-risk-classifier",
 *     "tool": "bash",
 *     "runId": "...",                      // from PreToolUse
 *     "status": "succeeded" | "failed" | "rolled_back" | "incident",
 *     "severity": "low" | "high" | "critical",   // optional
 *     "durationMs": 1240,                  // optional
 *     "errorMessage": "...",               // optional
 *     "result": {...},                     // optional, structured payload
 *     "summary": "...",                    // optional, human-readable
 *     "sessionId": "...",                  // optional
 *     "projectId": "..."                   // optional
 *   }
 *
 * Response:
 *
 *   {
 *     "recorded": true,
 *     "outcomeId": "...",
 *     "intelligenceId": "..." | null
 *   }
 */

import { handleApi } from "@/lib/api/auth";
import { handlePostToolUse, postToolUseSchema } from "@/lib/agents/tool-events";

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const body = await req.json().catch(() => ({}));
    const parsed = postToolUseSchema.safeParse(body);
    if (!parsed.success) {
      const err = new Error("Invalid PostToolUse payload") as Error & {
        status?: number;
        details?: unknown;
      };
      err.status = 400;
      err.details = parsed.error.issues;
      throw err;
    }
    return handlePostToolUse(ctx, parsed.data);
  });
}
