/**
 * Shared phase + tool map.
 *
 * Single source of truth for both the route-side enforcement engine
 * (`src/lib/agent-context/phase-enforcement.ts`) and the MCP CLI's fast-fail
 * check (`src/mcp/phase-data.ts`). Previously the two carried duplicate
 * copies and had drifted at least once.
 *
 * Lives under `src/mcp/` (not `src/lib/agent-context/`) so the MCP server bundle
 * can import it via a relative path without relying on Next.js's `@/`
 * alias. **No `@/` imports in this file** — keeps the CLI bundle slim
 * and free of Drizzle/Next.js transitive deps.
 *
 * `Phase` here must stay a literal-equal union of the schema's
 * `ProjectPhase`. The static-assertion in `phase-enforcement.ts`
 * catches any drift at compile time.
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

/**
 * Tools that bypass phase checks — orientation, navigation, validation,
 * the phase-transition verbs themselves, and the general
 * `invoke_skill` (phase-policing happens inside the skill).
 */
export const ALWAYS_ALLOWED = new Set<string>([
  "set_project",
  "switch_project",
  "get_my_context",
  "get_project_status",
  "get_requirements",
  "get_plans",
  "get_outcomes",
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
  "list_choreographies",
  "sync_choreographies",
  "search_learnings",
  "search_plans",
  "search_outcomes",
  "search_audit",
  "list_custom_choreographies",
  // Agent-loop governance — observability layer, available in all phases.
  "log_prompt",
  "rate_prompt",
  "get_prompt_author",
  "flush_local_prompts",
  // M-B verification-debt foundation reads — derived from the audit
  // ledger only, doctrine-compliant (no source-of-record writes).
  "get_autonomy",
  "get_verification_debt",
  "get_provenance",
]);

/**
 * Phase-gated tools. A verb absent from both this map and
 * `ALWAYS_ALLOWED` is denied by default (route side) and deferred to
 * the route (MCP side, since unknown locally is "let the route decide").
 */
export const TOOL_PHASE_MAP: Record<string, Phase[]> = {
  // Requirements
  draft_requirement: ["requirements"],
  list_draft_requirements: ["requirements"],
  update_draft_requirement: ["requirements"],
  delete_draft_requirement: ["requirements"],
  push_requirements: ["requirements"],
  create_requirement: ["requirements"],

  // Cross-phase submit
  submit_for_approval: ["requirements", "design", "development", "testing", "cicd"],

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
  // Actively kicking off a CI run is a CICD-phase verb.
  trigger_pipeline: ["cicd"],

  // Cross-phase external push
  push_to_external: ["requirements", "design", "development", "testing", "cicd"],

  // Plan upsert is broadly available; `kind` discriminates intent. No
  // per-kind phase rule yet — the agent picks the right kind and the
  // route trusts it. Add a kind→phase guard here when an agent picks
  // wrong in practice.
  upsert_plan: ["requirements", "design", "development", "testing", "cicd", "monitoring"],
};
