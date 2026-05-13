/**
 * Phase transitions — pure domain logic (no DB, no framework).
 *
 * The six SDLC phases progress linearly:
 *   requirements → design → development → testing → cicd → monitoring
 *
 * `monitoring` is terminal; rollback only happens via explicit `setPhase`
 * (intended for incident response, not the normal flow).
 */

import { PROJECT_PHASES, type ProjectPhase } from "@/db/schema/project";

const ORDER: ProjectPhase[] = [...PROJECT_PHASES];

export function nextPhase(current: ProjectPhase): ProjectPhase | null {
  const idx = ORDER.indexOf(current);
  if (idx === -1 || idx === ORDER.length - 1) return null;
  return ORDER[idx + 1];
}

export function previousPhase(current: ProjectPhase): ProjectPhase | null {
  const idx = ORDER.indexOf(current);
  if (idx <= 0) return null;
  return ORDER[idx - 1];
}

export function canAdvanceFrom(current: ProjectPhase): boolean {
  return nextPhase(current) !== null;
}

export function isPhaseAfter(a: ProjectPhase, b: ProjectPhase): boolean {
  return ORDER.indexOf(a) > ORDER.indexOf(b);
}

export interface PhaseGuidance {
  label: string;
  description: string;
  suggestedActions: string[];
  nextCondition: string;
  /**
   * Verbs an AI agent is explicitly permitted to perform during this phase.
   * Surfaced to MCP consumers (Cursor / Claude Code) via the context endpoint
   * and rendered in the cockpit "This phase" card. Borrowed from the
   * ai-sdlc-framework `sdlc-governance.mdc` discipline model.
   */
  allowed: string[];
  /**
   * Verbs explicitly forbidden during this phase. The load-bearing boundary:
   * no source-code work outside the `development` phase. Phase enforcement
   * for write-side MCP tools should reject calls whose intent matches a
   * forbidden entry rather than silently succeeding.
   */
  forbidden: string[];
}

/**
 * Per-phase guidance shown in the H2 cockpit's "This phase" card.
 *
 * Hardcoded defaults for v1 — see open question in build-plan.md about
 * eventually exposing these as a `phase_guidance` plan kind so orgs can
 * override (e.g., highly regulated teams add a "Compliance review" step).
 */
export const PHASE_GUIDANCE: Record<ProjectPhase, PhaseGuidance> = {
  requirements: {
    label: "Requirements",
    description:
      "Capture what we're building and why. Pin user/persona, success criteria, and out-of-scope items. Every requirement should have an acceptance criterion.",
    suggestedActions: [
      "Draft a `requirement` plan with success criteria",
      "Define personas and primary jobs-to-be-done",
      "List explicit non-goals to bound scope",
    ],
    nextCondition: "Three+ requirements with acceptance criteria, requirement quorum gate passed.",
    allowed: [
      "Discuss requirements with the user; ask, don't assume",
      "Draft `requirement` plans (saved as draft until the user pushes)",
      "Submit drafts for approval via the platform",
    ],
    forbidden: [
      "Inventing requirements without the user's explicit input",
      "Writing source code, configs, or scaffolding the project",
      "Running package managers (`npm install`, `pip install`, etc.) or build commands",
      "Creating git commits or branches",
    ],
  },
  design: {
    label: "Design",
    description:
      "Decide the shape. ADRs lock the key technical choices; architecture review verifies the design holds together; risks get a register.",
    suggestedActions: [
      "Write ADRs for every load-bearing technical decision",
      "Run an architecture review and log it",
      "Populate the risk register with mitigations",
    ],
    nextCondition: "ADR quorum reached, architecture review approved, risks logged.",
    allowed: [
      "Author ADRs (`adr` plans) and architecture-review notes",
      "Generate `test_plan` drafts from approved requirements",
      "Check proposed designs against active project rules",
    ],
    forbidden: [
      "Writing source code or implementation files",
      "Installing dependencies or scaffolding services",
      "Bypassing pending ADR approvals to move ahead with implementation",
    ],
  },
  development: {
    label: "Development",
    description:
      "Build the thing. Reviews stay tight, coverage stays above threshold, and ADR-required changes ship with their ADR.",
    suggestedActions: [
      "Land PRs against an approved plan with passing reviews",
      "Keep coverage above the project threshold",
      "Open `test_plan` and `release_plan` drafts in parallel",
    ],
    nextCondition: "Code review coverage, test coverage, and ADR-required gates all green.",
    allowed: [
      "Write and modify source code that complies with active rules",
      "Open PRs against an approved plan",
      "Run tests, builds, and package-manager commands",
      "Create branches and commits",
    ],
    forbidden: [
      "Shipping code that violates an `error`-severity rule",
      "Merging without coverage or review-quorum gates green",
      "Skipping the ADR for an architecture-touching change",
    ],
  },
  testing: {
    label: "Testing",
    description:
      "Prove it works. Test plan approved, E2E pass rate above threshold, rollback verified, change advisory signed off.",
    suggestedActions: [
      "Get test_plan approved by QA owner",
      "Fix flakes until E2E pass rate clears the threshold",
      "Run a rollback rehearsal and log the incident plan",
      "Collect change-advisory sign-off",
    ],
    nextCondition: "Test plan approved, E2E pass rate ≥ threshold, rollback verified, CAB sign-off recorded.",
    allowed: [
      "Execute test cases and record results",
      "Mark test cases passed/failed; auto-pass the QA gate when all approved tests pass",
      "Author or update `test_plan` plans to cover gaps",
    ],
    forbidden: [
      "Modifying source code (return to `development` to fix a regression)",
      "Forcing the QA gate green without test evidence",
      "Skipping the rollback rehearsal",
    ],
  },
  cicd: {
    label: "CI/CD",
    description:
      "Ship through the pipeline. Release plan locked, canary gates wired, deploy frequency healthy, regressions catch early.",
    suggestedActions: [
      "Lock the release plan and pin the canary thresholds",
      "Verify deploy automation runs end-to-end on staging",
      "Confirm rollback path is one button",
    ],
    nextCondition: "Release plan approved, canary gates green on a real deploy.",
    allowed: [
      "Update the `release_plan` with rollout, monitoring, and rollback sections",
      "Run pipeline diagnostics and canary checks",
      "Trigger deploys once the release plan is approved",
    ],
    forbidden: [
      "Deploying without an approved release plan",
      "Bypassing canary thresholds because they're inconvenient",
      "Touching source code (return to `development`)",
    ],
  },
  monitoring: {
    label: "Monitoring",
    description:
      "Operate it. DORA snapshot is the steady-state view; incidents drive plan kind=incident; archive when retired.",
    suggestedActions: [
      "Watch DORA trends — CFR, MTTR, lead time, deploy freq",
      "Open `incident` plans for every page",
      "Mark complete when the work is retired",
    ],
    nextCondition: "Terminal phase — no automatic advancement.",
    allowed: [
      "Open `incident` plans for every page or regression",
      "Annotate DORA aggregates with root-cause notes",
      "Archive the project when the work is retired",
    ],
    forbidden: [
      "Hot-patching production without an `incident` plan and rollback record",
      "Auto-rotating phases backward (use explicit `setPhase` for incident response)",
    ],
  },
};

