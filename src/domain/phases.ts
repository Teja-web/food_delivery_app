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
  },
};

