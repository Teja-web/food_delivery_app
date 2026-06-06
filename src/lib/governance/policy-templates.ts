/**
 * Governance policy templates — shipped catalog for the project-onboarding wizard.
 *
 * Each template is a small bundle of `governance_policies` rows that get
 * inserted on project create (alongside `defaultApproverIds`). Admins can
 * edit / delete / extend these in `/settings/governance-policies` after
 * the fact — templates are just opinionated starting points.
 *
 * Schema source of truth: `src/db/schema/governance/policies.ts`. The
 * `details` JSONB shape per kind is the same one the materializer reads
 * (`approverSource: "defaultApproverIds"` resolves to the project's
 * `defaultApproverIds` array at materialization time; `excludeAuthor: true`
 * filters the plan's creator out of the resolved approver set).
 */

import type { PlanKind, PlanStatus } from "@/db/schema/plan/plan-kinds";
import type { GovernanceKind, GovernanceScope } from "@/db/schema/governance/policies";

export interface TemplatePolicy {
  kind: GovernanceKind;
  scopeType: GovernanceScope;
  appliesToPlanKind: PlanKind | null;
  transitionFrom: PlanStatus | null;
  transitionTo: PlanStatus | null;
  name: string;
  description: string;
  details: Record<string, unknown>;
}

export interface PolicyTemplate {
  id: string;
  name: string;
  description: string;
  policies: TemplatePolicy[];
}

const APPROVAL_TRANSITION = { from: "draft" as const, to: "in_review" as const };

function approvalPolicy(args: {
  planKind: PlanKind | null;
  name: string;
  description: string;
  requiredCount: number;
}): TemplatePolicy {
  return {
    kind: "approval",
    scopeType: "project",
    appliesToPlanKind: args.planKind,
    transitionFrom: APPROVAL_TRANSITION.from,
    transitionTo: APPROVAL_TRANSITION.to,
    name: args.name,
    description: args.description,
    details: {
      requiredCount: args.requiredCount,
      approverSource: "defaultApproverIds",
      // excludeAuthor stays available in the schema for admins who want
      // strict separation-of-duties, but no shipped template enables it
      // by default — that would create unsatisfiable records on small
      // teams where the author is also one of the approvers.
    },
  };
}

export const POLICY_TEMPLATES: readonly PolicyTemplate[] = [
  {
    id: "lightweight",
    name: "Lightweight",
    description: "Author self-approves. Full audit trail captured.",
    policies: [],
  },
  {
    id: "standard",
    name: "Standard",
    description: "1 approval from your designated approvers.",
    policies: [
      approvalPolicy({
        planKind: null,
        name: "Plan approval (all kinds)",
        description: "All plans require 1 approver from the project's default approvers.",
        requiredCount: 1,
      }),
    ],
  },
  {
    id: "strict",
    name: "Strict",
    description: "2 approvals required from designated approvers.",
    policies: [
      approvalPolicy({
        planKind: null,
        name: "Plan approval (all kinds, 2-of-N)",
        description: "All plans require 2 approvers from the project's default approvers.",
        requiredCount: 2,
      }),
    ],
  },
  {
    id: "risk_scoped",
    name: "Risk-scoped",
    description:
      "Only ADRs, release plans, and risk registers require approval. Features and stories flow free.",
    policies: [
      approvalPolicy({
        planKind: "adr",
        name: "ADR approval",
        description: "Architecture decisions require 1 approver.",
        requiredCount: 1,
      }),
      approvalPolicy({
        planKind: "release_plan",
        name: "Release plan approval",
        description: "Release plans require 1 approver.",
        requiredCount: 1,
      }),
      approvalPolicy({
        planKind: "risk_register",
        name: "Risk register approval",
        description: "Risk registers require 1 approver.",
        requiredCount: 1,
      }),
    ],
  },
  {
    id: "custom",
    name: "Custom",
    description: "No defaults. Configure policies yourself in Settings later.",
    policies: [],
  },
] as const;

export const DEFAULT_TEMPLATE_ID = "standard";

export function getPolicyTemplate(id: string): PolicyTemplate | null {
  return POLICY_TEMPLATES.find((t) => t.id === id) ?? null;
}
