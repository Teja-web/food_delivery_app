/**
 * MCP-side phase fast-fail.
 *
 * Authoritative enforcement lives in the API route handlers
 * (`src/lib/mcp/phase-enforcement.ts`). This file lets the MCP server
 * short-circuit obviously-disallowed calls before the network roundtrip
 * (sub-ms denial vs a few hundred ms round-trip).
 *
 * The phase + tool maps are imported from `./phase-tool-map.js` — the
 * single source of truth shared with the route-side engine. Don't add a
 * local copy here; if you need a new mapping, add it to phase-tool-map.
 */

export { PHASES, ALWAYS_ALLOWED, TOOL_PHASE_MAP } from "./phase-tool-map.js";
export type { Phase } from "./phase-tool-map.js";

import { ALWAYS_ALLOWED, TOOL_PHASE_MAP, type Phase } from "./phase-tool-map.js";

export interface LocalPhaseCheck {
  allowed: boolean;
  message: string;
}

/**
 * Draft verbs operate on local in-memory state and are project-agnostic.
 * Allowed without a bound project; phase-gated normally (to requirements
 * phase only) once a project IS bound.
 */
const DRAFT_VERBS = new Set([
  "draft_requirement",
  "list_draft_requirements",
  "update_draft_requirement",
  "delete_draft_requirement",
]);

/**
 * Fast local check. Mirrors the route-side `checkPhaseAllowed` but
 * returns a terse message — the route returns the full guidance when
 * called for real.
 */
export function checkLocalPhase(
  toolName: string,
  currentPhase: Phase | null,
): LocalPhaseCheck {
  if (currentPhase === null) {
    if (toolName === "set_project" || toolName === "get_my_context") {
      return { allowed: true, message: "" };
    }
    if (DRAFT_VERBS.has(toolName)) {
      // Drafts are local-only — let them through without a bound project.
      // push_requirements will enforce a project at commit time.
      return { allowed: true, message: "" };
    }
    return {
      allowed: false,
      message:
        "No active project. Call `set_project` first, or pass `repoUrl` to `get_my_context`.",
    };
  }
  if (ALWAYS_ALLOWED.has(toolName)) return { allowed: true, message: "" };

  const allowedPhases = TOOL_PHASE_MAP[toolName];
  if (!allowedPhases) {
    // Unknown tool — defer to the route to decide (the dispatcher will
    // already have rejected on registration, so this branch is
    // unreachable in practice).
    return { allowed: true, message: "" };
  }
  if (allowedPhases.includes(currentPhase)) return { allowed: true, message: "" };
  return {
    allowed: false,
    message: `Tool "${toolName}" is not available in the ${currentPhase} phase. Available in: ${allowedPhases.join(", ")}.`,
  };
}
