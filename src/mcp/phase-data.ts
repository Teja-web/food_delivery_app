/**
 * MCP-side phase-enforcement data.
 *
 * The route-side engine in `src/lib/mcp/phase-enforcement.ts` is
 * AUTHORITATIVE — it has the final say and is what the agent will
 * ultimately hit. This file exists so the MCP server can short-circuit
 * obviously-disallowed calls before the network roundtrip (sub-ms
 * denial vs a few hundred ms round-trip).
 *
 * The data here is a snapshot of the route-side maps. They're small
 * and stable; keep them in sync manually. A drift between the two is
 * not a correctness bug — the route still rejects — just a missed
 * fast-fail.
 *
 * Lives in `src/mcp/` (not `src/lib/mcp/`) so the MCP server bundle
 * can import via relative paths without depending on Next.js's `@/`
 * alias resolver.
 */

export const PHASES = [
  "requirements",
  "design",
  "development",
  "testing",
  "cicd",
  "monitoring",
] as const;

export type Phase = (typeof PHASES)[number];

export const ALWAYS_ALLOWED = new Set<string>([
  "set_project",
  "switch_project",
  "get_my_context",
  "get_project_status",
  "get_requirements",
  "get_assigned_work",
  "check_standards",
  "get_phase_checklist",
  "submit_phase_for_review",
  "advance_phase",
  "setup_workspace",
  "session_start",
  "session_end",
  "mark_gate_passed",
  "invoke_skill",
]);

export const TOOL_PHASE_MAP: Record<string, Phase[]> = {
  draft_requirement: ["requirements"],
  list_draft_requirements: ["requirements"],
  update_draft_requirement: ["requirements"],
  delete_draft_requirement: ["requirements"],
  push_requirements: ["requirements"],
  create_requirement: ["requirements"],

  submit_for_approval: ["requirements", "design", "testing", "cicd"],

  log_decision: ["design", "development"],
  get_design_context: ["design", "development", "testing"],
  generate_tests: ["design", "testing"],

  create_pr: ["development"],
  update_work_item_status: ["development", "testing", "cicd"],

  update_test_result: ["testing"],

  get_pipeline_status: ["cicd", "monitoring"],

  push_to_external: ["requirements", "design", "development", "testing", "cicd"],
};

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
