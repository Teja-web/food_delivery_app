/**
 * MCP tool + resource registry — data only, no SDK glue.
 *
 * Split out of `server.ts` so the CLI bundle (`coznt call ...`) can import
 * the same `tools` array without dragging in `@modelcontextprotocol/sdk`.
 * Anything that needs the SDK (the Server class, request schemas) lives in
 * `server.ts` next to `createCozntMcpServer()`.
 */

import { z, ZodTypeAny } from "zod";

import { CozntClient } from "./client";
import { readConventions } from "./resources/conventions";
import { readHistory } from "./resources/history";
import { readMyTasks } from "./resources/my-tasks";
import { readStandards } from "./resources/standards";
import { checkStandardsInput, runCheckStandards } from "./tools/system/check-standards";
import { createRequirementInput, runCreateRequirement } from "./tools/requirement/create-requirement";
import {
  deleteDraftRequirementInput,
  runDeleteDraftRequirement,
} from "./tools/requirement/delete-draft-requirement";
import { draftRequirementInput, runDraftRequirement } from "./tools/requirement/draft-requirement";
import { generatePipelineInput, runGeneratePipeline } from "./tools/pipeline/generate-pipeline";
import { generateTestsInput, runGenerateTests } from "./tools/pipeline/generate-tests";
import { getAssignedWorkInput, runGetAssignedWork } from "./tools/context/get-assigned-work";
import { getDesignContextInput, runGetDesignContext } from "./tools/context/get-design-context";
import { getMyContextInput, runGetMyContext } from "./tools/context/get-my-context";
import {
  getProjectStandardsInput,
  runGetProjectStandards,
} from "./tools/context/get-project-standards";
import { setProjectInput, runSetProject } from "./tools/session/set-project";
import { switchProjectInput, runSwitchProject } from "./tools/session/switch-project";
import { getOutcomesInput, runGetOutcomes } from "./tools/skill/get-outcomes";
import { getPipelineStatusInput, runGetPipelineStatus } from "./tools/pipeline/get-pipeline-status";
import { getPlansInput, runGetPlans } from "./tools/plan/get-plans";
import { getProjectStatusInput, runGetProjectStatus } from "./tools/system/get-project-status";
import { getRequirementsInput, runGetRequirements } from "./tools/requirement/get-requirements";
import { invokeSkillInput, runInvokeSkill } from "./tools/skill/invoke-skill";
import {
  listChoreographiesInput,
  runListChoreographies,
} from "./tools/choreography/list-choreographies";
import {
  listCustomChoreographiesInput,
  runListCustomChoreographies,
} from "./tools/choreography/list-custom-choreographies";
import { searchAuditInput, runSearchAudit } from "./tools/audit/search-audit";
import {
  searchLearningsInput,
  runSearchLearnings,
} from "./tools/audit/search-learnings";
import { searchOutcomesInput, runSearchOutcomes } from "./tools/skill/search-outcomes";
import { searchPlansInput, runSearchPlans } from "./tools/plan/search-plans";
import {
  syncChoreographiesInput,
  runSyncChoreographies,
} from "./tools/choreography/sync-choreographies";
import {
  listDraftRequirementsInput,
  runListDraftRequirements,
} from "./tools/requirement/list-draft-requirements";
import { logDecisionInput, runLogDecision } from "./tools/plan/log-decision";
import { pushRequirementsInput, runPushRequirements } from "./tools/requirement/push-requirements";
import { sessionEndInput, runSessionEnd } from "./tools/session/session-end";
import { sessionStartInput, runSessionStart } from "./tools/session/session-start";
import {
  updateDraftRequirementInput,
  runUpdateDraftRequirement,
} from "./tools/requirement/update-draft-requirement";
import {
  updateTestResultInput,
  runUpdateTestResult,
} from "./tools/work/update-test-result";
import {
  updateWorkItemStatusInput,
  runUpdateWorkItemStatus,
} from "./tools/work/update-work-item-status";
import { upsertPlanInput, runUpsertPlan } from "./tools/plan/upsert-plan";
import { logPromptInput, runLogPrompt } from "./tools/prompt/log-prompt";
import { ratePromptInput, runRatePrompt } from "./tools/prompt/rate-prompt";
import { getPromptAuthorInput, runGetPromptAuthor } from "./tools/prompt/get-prompt-author";
import { flushLocalPromptsInput, runFlushLocalPrompts } from "./tools/prompt/flush-local-prompts";
import { triggerPipelineInput, runTriggerPipeline } from "./tools/pipeline/trigger-pipeline";
import { getAutonomyInput, runGetAutonomy } from "./tools/skill/get-autonomy";
import { getVerificationDebtInput, runGetVerificationDebt } from "./tools/audit/get-verification-debt";
import { getProvenanceInput, runGetProvenance } from "./tools/audit/get-provenance";
import {
  submitPlanForReviewInput,
  runSubmitPlanForReview,
} from "./tools/governance/submit-plan-for-review";
import {
  attachEvidenceInput,
  runAttachEvidence,
} from "./tools/governance/attach-evidence";
import {
  requestExceptionInput,
  runRequestException,
} from "./tools/governance/request-exception";
import {
  listGovernanceRecordsInput,
  runListGovernanceRecords,
} from "./tools/governance/list-governance-records";
import {
  createGovernanceRecordInput,
  runCreateGovernanceRecord,
} from "./tools/governance/create-governance-record";
import {
  decideGovernanceRecordInput,
  runDecideGovernanceRecord,
} from "./tools/governance/decide-governance-record";
import {
  pushPlanToJiraInput,
  runPushPlanToJira,
} from "./tools/integration/push-plan-to-jira";
import {
  syncJiraWorkItemsInput,
  runSyncJiraWorkItems,
} from "./tools/integration/sync-jira-work-items";

export interface ToolDef<T extends ZodTypeAny> {
  name: string;
  description: string;
  schema: T;
  run: (client: CozntClient, input: z.infer<T>) => Promise<unknown>;
}

function tool<T extends ZodTypeAny>(def: ToolDef<T>): ToolDef<T> {
  return def;
}

export const tools = [
  tool({
    name: "set_project",
    description: [
      "Bind the session to a project by id, slug, or name. Fuzzy-matches",
      "within the API key's org. NOT NEEDED at session start — the dispatcher",
      "auto-binds to the API key's pinned project on the first non-optional",
      "verb. Call this only when you need to operate on a project OTHER than",
      "the key's default.",
    ].join(" "),
    schema: setProjectInput,
    run: runSetProject,
  }),
  tool({
    name: "switch_project",
    description: [
      "Switch the session to a different project mid-conversation, or",
      "omit `project` to clear the binding entirely (next call rebinds",
      "from the API key default if one is set). Same fuzzy matcher as",
      "set_project.",
    ].join(" "),
    schema: switchProjectInput,
    run: runSwitchProject,
  }),
  tool({
    name: "get_my_context",
    description: [
      "Orient at session start. Returns the active project (id, name,",
      "description), a `welcome` block (headline, summary, nextActions) for",
      "first-message greeting, active rules, available skills with their",
      "per-project autonomy levels, standards metadata, recent ADRs, pinned learnings, and a",
      "recommendedKickoff when one applies. Call this FIRST in any session —",
      "every other tool's behavior depends on what's in the response.",
    ].join(" "),
    schema: getMyContextInput,
    run: runGetMyContext,
  }),
  tool({
    name: "get_project_status",
    description: [
      "Compact \"where are we?\" snapshot for the session's bound project.",
      "Returns governance_record counts (total / passed / failed / pending /",
      "skipped), open-approvals count, and last-deploy info. Use for the",
      "quick check before starting work. For the full briefing (rules,",
      "skills, ADRs) use get_my_context instead.",
    ].join(" "),
    schema: getProjectStatusInput,
    run: runGetProjectStatus,
  }),
  tool({
    name: "get_requirements",
    description: [
      "List requirement-like plans for the project. Coznt has no",
      "`requirement` plan kind — defaults to `story` (the closest analog).",
      "Pass `kind` to list other plan types (epic, feature, adr,",
      "test_plan, release_plan, incident).",
    ].join(" "),
    schema: getRequirementsInput,
    run: runGetRequirements,
  }),
  tool({
    name: "get_assigned_work",
    description: [
      "Open work in the project — in-progress plans + open work_items",
      "(GitHub issues / PRs, Jira tickets, ADO items). Pass",
      "`assigneeEmail` to narrow to one person; default returns all open",
      "work in the project.",
    ].join(" "),
    schema: getAssignedWorkInput,
    run: runGetAssignedWork,
  }),
  tool({
    name: "check_standards",
    description: [
      "Run project rules against a proposed plan body or proposed action",
      "before it lands. Advisory — nothing is persisted. Use this to",
      "self-correct before calling a write verb. Provide either `plan`",
      "(runs keyword-presence rules) or `action` (runs action-policy",
      "rules: blocked commands/paths, requireTests, maxFilesPerChange).",
    ].join(" "),
    schema: checkStandardsInput,
    run: runCheckStandards,
  }),
  // ── Governance (kind-parameterized — spec §10) ────────────────
  tool({
    name: "submit_plan_for_review",
    description: [
      "Move a plan_artifact from draft → in_review. Materializes the",
      "governance records (gates / approvals / reviews) that apply to the",
      "transition, per the project's active policies. Replaces the legacy",
      "submit_phase_for_review verb — governance is plan-bound, not",
      "phase-bound.",
    ].join(" "),
    schema: submitPlanForReviewInput,
    run: runSubmitPlanForReview,
  }),
  tool({
    name: "attach_evidence",
    description: [
      "Attach proof to a plan_artifact: a deployment, test_run, metric",
      "snapshot, work_item, skill_outcome, incident, or external link.",
      "One verb, type-discriminated by evidenceType — internal targets",
      "pass evidenceId; external targets pass externalUrl.",
    ].join(" "),
    schema: attachEvidenceInput,
    run: runAttachEvidence,
  }),
  tool({
    name: "request_exception",
    description: [
      "Open a pending exception governance_record that supersedes a",
      "failing or pending record. Carries reason + expiry. Per spec §4",
      "the exception itself still requires approval before it takes effect.",
    ].join(" "),
    schema: requestExceptionInput,
    run: runRequestException,
  }),
  tool({
    name: "list_governance_records",
    description: [
      "Read governance records targeting one plan_artifact. Optional",
      "filters by kind (gate / approval / review / exception) and status.",
    ].join(" "),
    schema: listGovernanceRecordsInput,
    run: runListGovernanceRecords,
  }),
  tool({
    name: "create_governance_record",
    description: [
      "Kind-parameterized creator. Spec §10: never split governance verbs",
      "by kind. Pass kind plus a details payload (approverIds, threshold,",
      "findings, etc.).",
    ].join(" "),
    schema: createGovernanceRecordInput,
    run: runCreateGovernanceRecord,
  }),
  tool({
    name: "decide_governance_record",
    description: [
      "Move a governance_record to a terminal status (passed / failed /",
      "skipped / expired). The underlying op records the decision; the",
      "evaluator dispatcher applies any per-kind side effects.",
    ].join(" "),
    schema: decideGovernanceRecordInput,
    run: runDecideGovernanceRecord,
  }),
  // ── Tier 2 ────────────────────────────────────────────────────
  tool({
    name: "create_requirement",
    description: [
      "Create one requirement-like plan. Coznt has no `requirement` plan",
      "kind — defaults to `story` (the closest analog). Pass `kind` to",
      "create epic/feature/test_plan/etc.",
    ].join(" "),
    schema: createRequirementInput,
    run: runCreateRequirement,
  }),
  tool({
    name: "push_requirements",
    description: [
      "Batch-create up to 50 requirement-like plans in one call. Useful",
      "after the agent has elaborated a list with the user. Defaults each",
      "item's kind to `story` if unspecified.",
    ].join(" "),
    schema: pushRequirementsInput,
    run: runPushRequirements,
  }),
  tool({
    name: "upsert_plan",
    description: [
      "File an authored markdown document as a plan. Upserts by",
      "(projectId, kind, slug): creates a new draft on first call, appends",
      "a plan_revisions row on subsequent calls with the same key. This is",
      "how generator skills (test-plan-generator, release-notes-generator,",
      "etc.) should land their output — plans ARE coznt's document",
      "container, kind discriminates the type.",
    ].join(" "),
    schema: upsertPlanInput,
    run: runUpsertPlan,
  }),
  tool({
    name: "get_plans",
    description: [
      "Two modes: list (omit `id`) returns metadata for plans matching the",
      "filters; fetch (provide `id`) returns full body + revisions +",
      "approvals for that one plan. Use this BEFORE authoring a follow-on",
      "plan — e.g. fetch approved requirements before running",
      "test-plan-generator.",
    ].join(" "),
    schema: getPlansInput,
    run: runGetPlans,
  }),
  tool({
    name: "get_design_context",
    description: [
      "Richer view than get_my_context for design/development/testing.",
      "Returns ADRs WITH FULL BODIES (not just titles), active",
      "features+stories, and linked work_items. Use when the agent needs",
      "to consult prior architectural decisions or know what features",
      "are in flight.",
    ].join(" "),
    schema: getDesignContextInput,
    run: runGetDesignContext,
  }),
  tool({
    name: "get_project_standards",
    description: [
      "Return exact effective organization/project standards for the bound",
      "project. Use before coding, UI design, architecture decisions, or",
      "brand-sensitive work. `get_my_context` returns only compact metadata;",
      "this returns the full bodies verbatim.",
    ].join(" "),
    schema: getProjectStandardsInput,
    run: runGetProjectStandards,
  }),
  tool({
    name: "update_work_item_status",
    description: [
      "Update a coznt work_item's status and/or assignee. For Jira-sourced",
      "work_items, the platform also attempts to transition the linked Jira",
      "issue to the matching workflow status.",
    ].join(" "),
    schema: updateWorkItemStatusInput,
    run: runUpdateWorkItemStatus,
  }),
  tool({
    name: "push_plan_to_jira",
    description: [
      "Manually push one Coznt plan into the project's bound Jira project.",
      "Creates a Jira issue on first push and updates the existing issue when",
      "the plan already has a jira externalRef.",
    ].join(" "),
    schema: pushPlanToJiraInput,
    run: runPushPlanToJira,
  }),
  tool({
    name: "sync_jira_work_items",
    description: [
      "Manually pull the bound Jira project's current issues into Coznt",
      "work_items. Use this when Jira webhooks are not configured yet.",
    ].join(" "),
    schema: syncJiraWorkItemsInput,
    run: runSyncJiraWorkItems,
  }),
  tool({
    name: "update_test_result",
    description: [
      "Record a test run result (status, counts, coverage). Feeds the",
      "`coverage` and `tests passing` governance-record validators, and",
      "attaches as a `test_run` evidence link to any plan_artifact id.",
    ].join(" "),
    schema: updateTestResultInput,
    run: runUpdateTestResult,
  }),
  tool({
    name: "get_pipeline_status",
    description: [
      "CI/CD + monitoring view: latest deployment, recent test runs with",
      "pass rate + coverage, active release_plan.",
    ].join(" "),
    schema: getPipelineStatusInput,
    run: runGetPipelineStatus,
  }),
  tool({
    name: "generate_pipeline",
    description: [
      "Render a CI/CD pipeline config (GitHub Actions, Azure DevOps,",
      "GitLab CI, or Jenkins) tailored to the project's tech stack. Returns",
      "{ filename, content } — the agent writes content to filename in the",
      "consumer repo. Optional Docker and Kubernetes addons.",
    ].join(" "),
    schema: generatePipelineInput,
    run: runGeneratePipeline,
  }),
  // ── Tier 3 ────────────────────────────────────────────────────
  tool({
    name: "invoke_skill",
    description: [
      "Run a registered skill against an input. Skills are coznt's unit of",
      "AI-driven work — each invocation flows through action-policy rules,",
      "records a result, and appends a skill_outcomes row that drives",
      "autonomy recompute. Pass the slug from get_my_context's skills list.",
    ].join(" "),
    schema: invokeSkillInput,
    run: runInvokeSkill,
  }),
  tool({
    name: "get_outcomes",
    description: [
      "Recent skill_outcomes rows for introspection. Answers questions like",
      "\"did my last test-plan-generator run succeed?\" without leaving the",
      "IDE. Read-only; defaults to the session's bound project. Omit skillSlug",
      "to see outcomes across every skill on the project.",
    ].join(" "),
    schema: getOutcomesInput,
    run: runGetOutcomes,
  }),
  tool({
    name: "generate_tests",
    description: [
      "Convenience wrapper that calls invoke_skill with slug=\"test-author\".",
      "Better IDE discoverability than asking agents to find the test-author",
      "skill themselves. Returns a clean error if no such skill exists in",
      "the org.",
    ].join(" "),
    schema: generateTestsInput,
    run: runGenerateTests,
  }),
  tool({
    name: "draft_requirement",
    description: [
      "Add a requirement-like draft to the session's local working set.",
      "Before using this tool, check `recommendedKickoff` on your most",
      "recent `get_my_context` response — when set, it points at the",
      "kickoff skill (e.g. feature-spec-generator) that should run first;",
      "calling this tool directly bypasses that routing. Use this tool",
      "only when recommendedKickoff is null or after the kickoff skill",
      "has run. In-memory only — drafts die with the MCP process. Use",
      "push_requirements (no items) to commit the draft set to the",
      "platform.",
    ].join(" "),
    schema: draftRequirementInput,
    run: runDraftRequirement,
  }),
  tool({
    name: "list_draft_requirements",
    description:
      "Return the session's local requirement drafts. Ephemeral — cleared on push or process exit.",
    schema: listDraftRequirementsInput,
    run: runListDraftRequirements,
  }),
  tool({
    name: "update_draft_requirement",
    description: [
      "Patch a session-local draft by its id. Only the fields you pass are",
      "changed; everything else is preserved.",
    ].join(" "),
    schema: updateDraftRequirementInput,
    run: runUpdateDraftRequirement,
  }),
  tool({
    name: "delete_draft_requirement",
    description:
      "Remove a session-local draft. No effect on the platform — drafts only exist in MCP-process memory until pushed.",
    schema: deleteDraftRequirementInput,
    run: runDeleteDraftRequirement,
  }),
  tool({
    name: "log_decision",
    description: [
      "Record an Architecture Decision Record. ADRs are stored as",
      "plan_artifact rows with `kind: \"adr\"`. Governance applies via the",
      "policies attached to ADR transitions, not phase enforcement.",
    ].join(" "),
    schema: logDecisionInput,
    run: runLogDecision,
  }),
  tool({
    name: "session_start",
    description: [
      "Open a session on coznt's side. Returns a sessionId that's recorded",
      "in the audit log alongside every subsequent tool call. Call this",
      "after get_my_context so the audit trail is complete.",
    ].join(" "),
    schema: sessionStartInput,
    run: runSessionStart,
  }),
  tool({
    name: "session_end",
    description: [
      "Close the current session and write its summary (outcome, duration,",
      "tool call count) to the audit log. Idempotent — calling it twice is",
      "safe.",
    ].join(" "),
    schema: sessionEndInput,
    run: runSessionEnd,
  }),
  tool({
    name: "list_choreographies",
    description: [
      "Distribution: return the choreography manifest for the bound project.",
      "Each entry has `slug`, `version`, `hash` (SHA-256), `description`,",
      "and `minAutonomy`. The `coznt sync` CLI uses this to diff against",
      "local `.lock` files before deciding which choreographies to fetch.",
      "Read-only.",
    ].join(" "),
    schema: listChoreographiesInput,
    run: runListChoreographies,
  }),
  tool({
    name: "sync_choreographies",
    description: [
      "Distribution: return the full content bundle of choreographies for",
      "the bound project. Pass `slugs` to fetch only a subset (preserves",
      "order; unknown slugs error). The response carries a `manifestHash`",
      "deterministic over the sorted slug→hash map. Read-only.",
    ].join(" "),
    schema: syncChoreographiesInput,
    run: runSyncChoreographies,
  }),
  tool({
    name: "search_learnings",
    description: [
      "Knowledge: semantic + keyword search over project learnings. Use when",
      "the user asks 'what did we decide about X?' or 'have we noted Y?'.",
      "Returns ranked hits with body, pinned flag, project, and relevance",
      "score. Defaults to hybrid mode (vector + BM25); pass `mode: \"vector\"`",
      "or `mode: \"keyword\"` for single-signal search.",
    ].join(" "),
    schema: searchLearningsInput,
    run: runSearchLearnings,
  }),
  tool({
    name: "search_plans",
    description: [
      "Knowledge: semantic + keyword search over plans (ADRs, features,",
      "stories, release_plans, etc.). 'Where was that ADR about authn?'",
      "Filter by `kinds` and/or `statuses` to narrow.",
    ].join(" "),
    schema: searchPlansInput,
    run: runSearchPlans,
  }),
  tool({
    name: "search_outcomes",
    description: [
      "Knowledge: keyword search over skill_outcomes.rationale. 'Have we",
      "seen this failure before?' Filter by verdicts and time range.",
    ].join(" "),
    schema: searchOutcomesInput,
    run: runSearchOutcomes,
  }),
  tool({
    name: "search_audit",
    description: [
      "Knowledge: keyword search over audit_logs (summary + action).",
      "CISO-style 'show me everything around the v2.3 incident' queries.",
      "Filter by actorType and time range. Ranked by recency.",
    ].join(" "),
    schema: searchAuditInput,
    run: runSearchAudit,
  }),
  tool({
    name: "list_custom_choreographies",
    description: [
      "Distribution: return the manifest of customer-authored choreographies",
      "for the bound project (project-scoped + org-wide). Companion to",
      "`list_choreographies` which returns platform-shipped entries.",
      "Read-only.",
    ].join(" "),
    schema: listCustomChoreographiesInput,
    run: runListCustomChoreographies,
  }),
  // ── Agent-loop governance (Tier 1/2) ──────────────────────────
  tool({
    name: "log_prompt",
    description: [
      "Persist a USER / ASSISTANT / SYSTEM message to the agent-loop ledger",
      "so coznt can grade prompt quality and feed the autonomy attenuation",
      "factor. Idempotent on (projectId, clientLocalId). On platform-side",
      "failure, the prompt is buffered to .coznt/prompt-buffer.jsonl and",
      "drained later via `flush_local_prompts`.",
    ].join(" "),
    schema: logPromptInput,
    run: runLogPrompt,
  }),
  tool({
    name: "rate_prompt",
    description: [
      "Score a prompt against the canonical 6-dimension rubric (clarity,",
      "context, specificity, constraints, phaseFit, safety) without",
      "persisting. Returns overallScore, tier (GOOD / NEEDS_IMPROVEMENT /",
      "POOR), dimension breakdown, suggestions, and flags. Provide either",
      "`content` (inline) or `promptLogId` (re-score an existing row).",
    ].join(" "),
    schema: ratePromptInput,
    run: runRatePrompt,
  }),
  tool({
    name: "get_prompt_author",
    description: [
      "Resolve the local developer's identity for prompt attribution.",
      "Reads git config user.name / user.email and OS username; respects",
      "COZNT_PROMPT_AUTHOR / COZNT_PROMPT_AUTHOR_EMAIL env overrides.",
      "Pure-local — no platform call.",
    ].join(" "),
    schema: getPromptAuthorInput,
    run: runGetPromptAuthor as never,
  }),
  tool({
    name: "flush_local_prompts",
    description: [
      "Drain `.coznt/prompt-buffer.jsonl` to the platform. Atomic on success",
      "— only failed entries remain in the buffer. Returns { flushed, errors }.",
    ].join(" "),
    schema: flushLocalPromptsInput,
    run: runFlushLocalPrompts,
  }),
  tool({
    name: "trigger_pipeline",
    description: [
      "Actively trigger a CI/CD pipeline run on GitHub Actions or Azure",
      "DevOps for the bound project. Returns the run id (when the provider",
      "exposes one) and queued status.",
    ].join(" "),
    schema: triggerPipelineInput,
    run: runTriggerPipeline,
  }),
  // ── M-B verification-debt foundation reads ─────────────────────
  tool({
    name: "get_autonomy",
    description: [
      "Read autonomy state for the calling project. Without `skillSlug`,",
      "returns the project-level aggregate (counts at each level, recent",
      "incidents). With `skillSlug`, returns the per-project autonomy for",
      "that skill plus the across-projects breakdown. Read-only.",
    ].join(" "),
    schema: getAutonomyInput,
    run: runGetAutonomy,
  }),
  tool({
    name: "get_verification_debt",
    description: [
      "Compute the verification-debt score for the calling project.",
      "Derived only from the audit ledger (autonomy distance × invocations,",
      "open approvals × age, gate trip rate × severity, unreviewed AI-authored",
      "changes). Returns total + per-term breakdown. Read-only.",
    ].join(" "),
    schema: getVerificationDebtInput,
    run: runGetVerificationDebt,
  }),
  tool({
    name: "get_provenance",
    description: [
      "Provenance summary for plans + work_items in the calling project:",
      "AI-authored ratio, per-model count, per-skill count, autonomy",
      "distribution at generation time. Counts only — never code, never",
      "prompt bodies. Read-only.",
    ].join(" "),
    schema: getProvenanceInput,
    run: runGetProvenance,
  }),
] as const;

export const RESOURCES = [
  {
    uri: "coznt://conventions",
    name: "Active conventions and rules",
    description: "The rules coznt enforces for this project (severity, scope, body).",
    mimeType: "application/json",
    read: readConventions,
  },
  {
    uri: "coznt://standards",
    name: "Effective organization standards",
    description: "Exact org/project coding, brand, architecture, and custom standards.",
    mimeType: "application/json",
    read: readStandards,
  },
  {
    uri: "coznt://my-tasks",
    name: "Your tasks",
    description: "Work items and open plans visible to this API key.",
    mimeType: "application/json",
    read: readMyTasks,
  },
  {
    uri: "coznt://history",
    name: "Recent audit history",
    description: "Last 7 days of audit events for this project.",
    mimeType: "application/json",
    read: readHistory,
  },
] as const;
