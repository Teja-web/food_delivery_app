/**
 * Phase enforcement for MCP tools.
 *
 * Maps each MCP tool to the SDLC phases in which it is allowed. Tools in
 * the ALWAYS_ALLOWED set bypass phase checks. Tools not in TOOL_PHASE_MAP
 * or ALWAYS_ALLOWED are denied by default — fail closed.
 *
 * Authoritative enforcement lives in the API route handlers (the MCP
 * server is just an HTTP client). Each `/api/v1/mcp/*` route that mutates
 * state calls `checkPhaseAllowed(verb, project.phase)` after resolving
 * the project and before doing any work. Denials return a structured
 * 403 body that surfaces back to the agent as a clear error.
 *
 * Per-phase guidance text is sourced from coznt's `PHASE_GUIDANCE`
 * (`@/domain/phases`) — no second source of truth.
 *
 * Ported from `/Users/ram/Projects/SDLC/apps/mcp-server/src/phase-enforcement.ts`.
 */

import { PROJECT_PHASES, type ProjectPhase } from "@/db/schema/project";
import { PHASE_GUIDANCE } from "@/domain/phases";

/**
 * Tools that bypass phase checks — orientation, navigation, validation,
 * and the phase-transition verbs themselves.
 */
export const ALWAYS_ALLOWED = new Set<string>([
  "set_project",
  "switch_project",
  "get_my_context",
  "get_project_status",
  "get_requirements",
  "get_plans",
  "get_assigned_work",
  "check_standards",
  "get_phase_checklist",
  "submit_phase_for_review",
  "advance_phase",
  "setup_workspace",
  // Coznt-specific tools (no SDLC analog) — always allowed.
  "session_start",
  "session_end",
  "mark_gate_passed",
  // General skill-invocation verb. Phase enforcement happens *inside* the
  // skill (via action-policy rules) rather than at the verb level — a
  // skill may be allowed in any phase its rules permit.
  "invoke_skill",
]);

/**
 * Phase-gated tools. A verb absent from both this map and
 * `ALWAYS_ALLOWED` is denied by default.
 */
export const TOOL_PHASE_MAP: Record<string, ProjectPhase[]> = {
  // Requirements
  draft_requirement: ["requirements"],
  list_draft_requirements: ["requirements"],
  update_draft_requirement: ["requirements"],
  delete_draft_requirement: ["requirements"],
  push_requirements: ["requirements"],
  create_requirement: ["requirements"],

  // Cross-phase submit
  submit_for_approval: ["requirements", "design", "testing", "cicd"],

  // Design
  log_decision: ["design", "development"],
  get_design_context: ["design", "development", "testing"],
  generate_tests: ["design", "testing"],

  // Development
  create_pr: ["development"],
  update_work_item_status: ["development", "testing", "cicd"],

  // Testing
  update_test_result: ["testing"],

  // CI/CD + Monitoring
  get_pipeline_status: ["cicd", "monitoring"],
  generate_pipeline: ["development", "testing", "cicd"],

  // Cross-phase external push
  push_to_external: ["requirements", "design", "development", "testing", "cicd"],

  // Plan upsert is broadly available; `kind` discriminates intent. No
  // per-kind phase rule yet — the agent picks the right kind and the route
  // trusts it. Add a kind→phase guard here when an agent picks wrong in
  // practice.
  upsert_plan: ["requirements", "design", "development", "testing", "cicd", "monitoring"],
};

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
    if (toolName === "set_project" || toolName === "get_my_context") {
      return { allowed: true, currentPhase: null, message: "" };
    }
    return {
      allowed: false,
      currentPhase: null,
      message:
        "No active project. Call `set_project` first to bind a project to this session, " +
        "or pass `repoUrl` to `get_my_context` so coznt can resolve one.",
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
  if (currentPhase === null) return ["set_project", "get_my_context"];
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
