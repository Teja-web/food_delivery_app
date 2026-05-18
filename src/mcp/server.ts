/**
 * Coznt MCP server.
 *
 * One server that learns from both:
 *   - `@ai-sdlc/mcp-advisor` — session/context bridge model (read-heavy,
 *     resources for cacheable context, lightweight tools for telemetry)
 *   - `@sdlc-platform/mcp-server` — agent-as-driver model (write tools
 *     for the points where coznt is the source of truth)
 *
 * What lands here is the synthesis the architecture review picked:
 *   - Resources: passive, MCP-native, for cacheable context
 *   - Context tools: read + session telemetry
 *   - Discipline writes: only where coznt is the system of record
 *
 * Excluded by design (let GitHub/Jira stay the source of truth, observe
 * via webhook): create-pr, push-to-external, setup-workspace.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { CozntClient, CozntApiError, readConfig } from "./client.js";
import { checkLocalPhase, type Phase } from "./phase-data.js";
import { readConventions } from "./resources/conventions.js";
import { readHistory } from "./resources/history.js";
import { readMyTasks } from "./resources/my-tasks.js";
import { getSessionProject } from "./session.js";
import { advancePhaseInput, runAdvancePhase } from "./tools/advance-phase.js";
import { checkStandardsInput, runCheckStandards } from "./tools/check-standards.js";
import { createRequirementInput, runCreateRequirement } from "./tools/create-requirement.js";
import {
  deleteDraftRequirementInput,
  runDeleteDraftRequirement,
} from "./tools/delete-draft-requirement.js";
import { draftRequirementInput, runDraftRequirement } from "./tools/draft-requirement.js";
import { generatePipelineInput, runGeneratePipeline } from "./tools/generate-pipeline.js";
import { generateTestsInput, runGenerateTests } from "./tools/generate-tests.js";
import { getAssignedWorkInput, runGetAssignedWork } from "./tools/get-assigned-work.js";
import { getDesignContextInput, runGetDesignContext } from "./tools/get-design-context.js";
import { getMyContextInput, runGetMyContext } from "./tools/get-my-context.js";
import { getOutcomesInput, runGetOutcomes } from "./tools/get-outcomes.js";
import { getPhaseChecklistInput, runGetPhaseChecklist } from "./tools/get-phase-checklist.js";
import { getPipelineStatusInput, runGetPipelineStatus } from "./tools/get-pipeline-status.js";
import { getPlansInput, runGetPlans } from "./tools/get-plans.js";
import { getProjectStatusInput, runGetProjectStatus } from "./tools/get-project-status.js";
import { getRequirementsInput, runGetRequirements } from "./tools/get-requirements.js";
import { invokeSkillInput, runInvokeSkill } from "./tools/invoke-skill.js";
import {
  listChoreographiesInput,
  runListChoreographies,
} from "./tools/list-choreographies.js";
import {
  listCustomChoreographiesInput,
  runListCustomChoreographies,
} from "./tools/list-custom-choreographies.js";
import { searchAuditInput, runSearchAudit } from "./tools/search-audit.js";
import {
  searchLearningsInput,
  runSearchLearnings,
} from "./tools/search-learnings.js";
import { searchOutcomesInput, runSearchOutcomes } from "./tools/search-outcomes.js";
import { searchPlansInput, runSearchPlans } from "./tools/search-plans.js";
import {
  syncChoreographiesInput,
  runSyncChoreographies,
} from "./tools/sync-choreographies.js";
import {
  listDraftRequirementsInput,
  runListDraftRequirements,
} from "./tools/list-draft-requirements.js";
import { logDecisionInput, runLogDecision } from "./tools/log-decision.js";
import { markGatePassedInput, runMarkGatePassed } from "./tools/mark-gate-passed.js";
import { pushRequirementsInput, runPushRequirements } from "./tools/push-requirements.js";
import { sessionEndInput, runSessionEnd } from "./tools/session-end.js";
import { sessionStartInput, runSessionStart } from "./tools/session-start.js";
import { setProjectInput, runSetProject } from "./tools/set-project.js";
import {
  submitForApprovalInput,
  runSubmitForApproval,
} from "./tools/submit-for-approval.js";
import {
  submitPhaseForReviewInput,
  runSubmitPhaseForReview,
} from "./tools/submit-phase-for-review.js";
import { switchProjectInput, runSwitchProject } from "./tools/switch-project.js";
import {
  updateDraftRequirementInput,
  runUpdateDraftRequirement,
} from "./tools/update-draft-requirement.js";
import {
  updateTestResultInput,
  runUpdateTestResult,
} from "./tools/update-test-result.js";
import {
  updateWorkItemStatusInput,
  runUpdateWorkItemStatus,
} from "./tools/update-work-item-status.js";
import { upsertPlanInput, runUpsertPlan } from "./tools/upsert-plan.js";

import { z, ZodTypeAny } from "zod";

const SERVER_NAME = "coznt-mcp";
const SERVER_VERSION = "0.1.0";

interface ToolDef<T extends ZodTypeAny> {
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
      "Bind a project to this MCP session. Fuzzy-matches the input against",
      "id, slug, and name. Call this first when starting work, or when the",
      "API key is org-scoped and doesn't already pin a project. Subsequent",
      "tools auto-resolve the project from the session — no need to pass",
      "projectId repeatedly.",
    ].join(" "),
    schema: setProjectInput,
    run: runSetProject,
  }),
  tool({
    name: "switch_project",
    description: [
      "Re-bind the session to a different project, or clear the binding by",
      "omitting `project`. Same fuzzy-match semantics as set_project. Use",
      "when the agent moves between projects mid-IDE without restarting.",
    ].join(" "),
    schema: switchProjectInput,
    run: runSwitchProject,
  }),
  tool({
    name: "get_my_context",
    description: [
      "Orient at session start. Returns the active project, current phase,",
      "phase discipline (allowed/forbidden lists), active rules, available",
      "skills (with their autonomy levels), and recent ADRs.",
      "Call this FIRST in any session — every other tool's behavior depends",
      "on what's in the response.",
    ].join(" "),
    schema: getMyContextInput,
    run: runGetMyContext,
  }),
  tool({
    name: "get_project_status",
    description: [
      "Compact \"where are we?\" snapshot for the session's bound project.",
      "Returns current phase, gate counts with named pending gates, open",
      "approvals count, and last-deploy info. Use this for the quick check",
      "before doing work or deciding to advance phase. For the full briefing",
      "(rules, skills, ADRs) use get_my_context instead.",
    ].join(" "),
    schema: getProjectStatusInput,
    run: runGetProjectStatus,
  }),
  tool({
    name: "get_phase_checklist",
    description: [
      "List every gate in the current phase with its status, and a",
      "readyToAdvance boolean. Call before submit_phase_for_review to",
      "see what's still pending.",
    ].join(" "),
    schema: getPhaseChecklistInput,
    run: runGetPhaseChecklist,
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
  tool({
    name: "submit_phase_for_review",
    description: [
      "Ask reviewers to sign off on advancing the current phase. For each",
      "approval-type gate that's still pending or failed, ensures an open",
      "approval row exists (idempotent — existing approvals are returned",
      "as-is). Non-approval gates (coverage / lint / security) clear via",
      "their own mechanism — call get_phase_checklist to see them.",
    ].join(" "),
    schema: submitPhaseForReviewInput,
    run: runSubmitPhaseForReview,
  }),
  tool({
    name: "advance_phase",
    description: [
      "Advance the project to the next SDLC phase. Fails with 409 + the",
      "unmet-gates list if any gate isn't passed/skipped. On success,",
      "updates the session's cached phase. Call get_phase_checklist first",
      "to verify readiness.",
    ].join(" "),
    schema: advancePhaseInput,
    run: runAdvancePhase,
  }),
  // ── Tier 2 ────────────────────────────────────────────────────
  tool({
    name: "create_requirement",
    description: [
      "Create one requirement-like plan. Coznt has no `requirement` plan",
      "kind — defaults to `story` (the closest analog). Pass `kind` to",
      "create epic/feature/test_plan/etc. Allowed only in the requirements",
      "phase (per the phase-enforcement engine).",
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
    name: "update_work_item_status",
    description: [
      "Update a coznt work_item's status and/or assignee. Does NOT sync",
      "the change upstream (GitHub / Jira / ADO) — that's push_to_external's",
      "job. Allowed in development / testing / cicd phases.",
    ].join(" "),
    schema: updateWorkItemStatusInput,
    run: runUpdateWorkItemStatus,
  }),
  tool({
    name: "update_test_result",
    description: [
      "Record a test run result (status, counts, coverage). Feeds the",
      "`coverage` and `tests passing` phase-gate validators. Allowed in",
      "the testing phase.",
    ].join(" "),
    schema: updateTestResultInput,
    run: runUpdateTestResult,
  }),
  tool({
    name: "get_pipeline_status",
    description: [
      "CI/CD + monitoring view: latest deployment, recent test runs with",
      "pass rate + coverage, active release_plan. Allowed in the cicd",
      "and monitoring phases.",
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
      "consumer repo. Optional Docker and Kubernetes addons. Allowed in",
      "development / testing / cicd.",
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
      "the org. Allowed in design + testing phases.",
    ].join(" "),
    schema: generateTestsInput,
    run: runGenerateTests,
  }),
  tool({
    name: "draft_requirement",
    description: [
      "Add a requirement-like draft to the session's local working set.",
      "In-memory only — drafts die with the MCP process. Use",
      "push_requirements (no items) to commit the draft set to the",
      "platform. Allowed in the requirements phase.",
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
    name: "mark_gate_passed",
    description: [
      "Flip a phase gate to passed. Server checks: (1) the gate belongs to",
      "the project's current phase, (2) the API key has scope. If every",
      "gate in the current phase is now passed/skipped, coznt auto-advances",
      "the project to the next phase and notifies every org member.",
    ].join(" "),
    schema: markGatePassedInput,
    run: runMarkGatePassed,
  }),
  tool({
    name: "submit_for_approval",
    description: [
      "Submit a plan, gate, release, or work_item for human approval.",
      "Creates an approval row that appears on the /approvals inbox.",
      "Use this when the work is done from the agent's side but needs",
      "a human sign-off before it can proceed.",
    ].join(" "),
    schema: submitForApprovalInput,
    run: runSubmitForApproval,
  }),
  tool({
    name: "log_decision",
    description: [
      "Record an Architecture Decision Record. ADRs are stored as `plan`",
      "rows with `kind: \"adr\"`. Typically used in the Design phase.",
      "Server rejects the call if the current phase forbids it (see the",
      "forbidden list in get_my_context).",
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
      "Read-only; available in every phase.",
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
      "deterministic over the sorted slug→hash map. Read-only; available",
      "in every phase.",
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
      "Read-only; available in every phase.",
    ].join(" "),
    schema: listCustomChoreographiesInput,
    run: runListCustomChoreographies,
  }),
] as const;

export const RESOURCES = [
  {
    uri: "coznt://conventions",
    name: "Active conventions and rules",
    description: "The rules coznt enforces for this project (severity, phase scope, body).",
    mimeType: "application/json",
    read: readConventions,
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

function zodToJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  // Zod v4 ships a built-in JSON Schema emitter — no extra dep needed.
  return z.toJSONSchema(schema) as Record<string, unknown>;
}

export function createCozntMcpServer(): Server {
  const cfg = readConfig();
  const client = new CozntClient(cfg);
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.schema),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const found = tools.find((t) => t.name === req.params.name);
    if (!found) {
      return {
        content: [{ type: "text" as const, text: `Unknown tool: ${req.params.name}` }],
        isError: true,
      };
    }
    const parsed = found.schema.safeParse(req.params.arguments ?? {});
    if (!parsed.success) {
      return {
        content: [{ type: "text" as const, text: `Invalid input: ${parsed.error.message}` }],
        isError: true,
      };
    }
    // Local phase pre-check: fail fast without a network roundtrip when
    // the current phase clearly disallows the verb. The route is still
    // authoritative — it re-checks against fresh state. A drift between
    // local and route maps is not a correctness bug, just a missed
    // fast-fail.
    const cachedPhase = (getSessionProject()?.phase ?? null) as Phase | null;
    const phaseCheck = checkLocalPhase(req.params.name, cachedPhase);
    if (!phaseCheck.allowed) {
      return {
        content: [{ type: "text" as const, text: phaseCheck.message }],
        isError: true,
      };
    }
    try {
      // The tools array is a union of differently-shaped inputs; the
      // narrowing via `.find(... .name)` doesn't carry through the union,
      // so we cast at the call site. Zod has already validated the input.
      const run = found.run as (c: CozntClient, i: unknown) => Promise<unknown>;
      const result = await run(client, parsed.data);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const msg =
        err instanceof CozntApiError
          ? `${err.message} (status ${err.status}${err.details ? `, details: ${JSON.stringify(err.details)}` : ""})`
          : err instanceof Error
            ? err.message
            : "unknown error";
      return {
        content: [{ type: "text" as const, text: msg }],
        isError: true,
      };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: RESOURCES.map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
    })),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const found = RESOURCES.find((r) => r.uri === req.params.uri);
    if (!found) {
      throw new Error(`Unknown resource: ${req.params.uri}`);
    }
    return found.read(client);
  });

  return server;
}
