/**
 * Phase enforcement for MCP tools — route-side, authoritative.
 *
 * Maps each MCP tool to the SDLC phases in which it is allowed. Tools in
 * the ALWAYS_ALLOWED set bypass phase checks. Tools not in TOOL_PHASE_MAP
 * or ALWAYS_ALLOWED are denied by default — fail closed.
 *
 * Each `/api/v1/mcp/*` route that mutates state calls
 * `checkPhaseAllowed(verb, project.phase)` after resolving the project
 * and before doing any work. Denials return a structured 403 body that
 * surfaces back to the agent as a clear error.
 *
 * The phase + tool maps are imported from `src/mcp/phase-tool-map.ts` —
 * the single source of truth shared with the MCP CLI's fast-fail check.
 * Per-phase guidance text is sourced from coznt's `PHASE_GUIDANCE`
 * (`@/domain/phases`).
 *
 * Ported from `/Users/ram/Projects/SDLC/apps/mcp-server/src/phase-enforcement.ts`.
 */

import { PROJECT_PHASES, type ProjectPhase } from "@/db/schema/project";
import { PHASE_GUIDANCE } from "@/domain/phases";
import {
  ALWAYS_ALLOWED as SHARED_ALWAYS_ALLOWED,
  TOOL_PHASE_MAP as SHARED_TOOL_PHASE_MAP,
  type Phase,
} from "@/mcp/phase-tool-map";

// Static guarantee: the shared `Phase` union must equal the schema's
// `ProjectPhase`. If a phase is added to one without the other, this
// assignment fails at compile time and the two surfaces stop drifting.
type _PhaseAlignment = [Phase] extends [ProjectPhase]
  ? [ProjectPhase] extends [Phase]
    ? true
    : false
  : false;
const _phaseAligned: _PhaseAlignment = true;
void _phaseAligned;

export const ALWAYS_ALLOWED = SHARED_ALWAYS_ALLOWED;
export const TOOL_PHASE_MAP: Record<string, ProjectPhase[]> = SHARED_TOOL_PHASE_MAP;

export interface PhaseCheckResult {
  allowed: boolean;
  currentPhase: ProjectPhase | null;
  /** Empty when allowed; structured explanation when denied. */
  message: string;
}

/**
 * Decide whether `toolName` may execute in `currentPhase`. `currentPhase`
 * may be null when no project is bound — only project-binding verbs work
 * in that case.
 */
export function checkPhaseAllowed(
  toolName: string,
  currentPhase: ProjectPhase | null,
): PhaseCheckResult {
  if (currentPhase === null) {
    if (toolName === "get_my_context") {
      return { allowed: true, currentPhase: null, message: "" };
    }
    return {
      allowed: false,
      currentPhase: null,
      message:
        "No active project on the session. The API key's bound project couldn't be resolved — " +
        "check COZNT_API_KEY, or pass `repoUrl` to `get_my_context` to disambiguate.",
    };
  }

  if (ALWAYS_ALLOWED.has(toolName)) {
    return { allowed: true, currentPhase, message: "" };
  }

  const allowedPhases = TOOL_PHASE_MAP[toolName];
  if (!allowedPhases) {
    return {
      allowed: false,
      currentPhase,
      message:
        `Tool "${toolName}" is not registered with the phase-enforcement engine. ` +
        `Tools must appear in either ALWAYS_ALLOWED or TOOL_PHASE_MAP to be callable.`,
    };
  }

  if (allowedPhases.includes(currentPhase)) {
    return { allowed: true, currentPhase, message: "" };
  }

  const guidance = PHASE_GUIDANCE[currentPhase];
  return {
    allowed: false,
    currentPhase,
    message: [
      `Tool "${toolName}" is not available in the ${currentPhase} phase.`,
      `Available in: ${allowedPhases.join(", ")}.`,
      ``,
      `In ${guidance.label} you should be:`,
      ...guidance.allowed.map((line) => `  - ${line}`),
      ``,
      `If the project is ready to advance, call \`get_phase_checklist\` to see what's pending, ` +
        `then \`submit_phase_for_review\` when all gates are green.`,
    ].join("\n"),
  };
}

/** Return the list of tools callable in the given phase. */
export function getAllowedTools(currentPhase: ProjectPhase | null): string[] {
  if (currentPhase === null) return ["get_my_context"];
  const tools = [...ALWAYS_ALLOWED];
  for (const [tool, phases] of Object.entries(TOOL_PHASE_MAP)) {
    if (phases.includes(currentPhase)) tools.push(tool);
  }
  return tools.sort();
}

/** Next phase in linear progression, or null at terminal `monitoring`. */
export function getNextPhase(current: ProjectPhase): ProjectPhase | null {
  const idx = PROJECT_PHASES.indexOf(current);
  if (idx < 0 || idx >= PROJECT_PHASES.length - 1) return null;
  return PROJECT_PHASES[idx + 1];
}
