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
 * Project-binding verbs — allowed without a project bound since they're
 * how a session acquires one. `set_project` resolves the API key's bound
 * project (or fuzzy-matches one by id/slug/name); `switch_project` swaps.
 */
const PROJECT_BINDING_VERBS = new Set(["set_project", "switch_project"]);

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
    if (toolName === "get_my_context") {
      return { allowed: true, message: "" };
    }
    if (PROJECT_BINDING_VERBS.has(toolName)) {
      // Project-binding verbs are the path out of the unbound state.
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
        "No active project on the session. Call `set_project` (fuzzy-matches by id/slug/name) to bind one, or check COZNT_API_KEY if the key should resolve to a default project.",
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
