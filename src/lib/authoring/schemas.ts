/**
 * Per-artifact-kind Zod schemas for `.agents/**\/*.md` frontmatter.
 *
 * These shapes are the contract between the dev (who writes the file) and
 * the merge-webhook sync tasks (which import the file into DB rows). The
 * same schemas back the JSON Schema published at
 * `/install/coznt-authoring-schema.json` for editor autocomplete +
 * validation per docs/spec/dev-authoring-surface.md §17.
 *
 * Three discriminated unions live here:
 *   - skillFileFrontmatterSchema    (.agents/skills/*.md)
 *   - ruleFileFrontmatterSchema     (.agents/rules/*.md, discriminator `validator`)
 *   - planFileFrontmatterSchema     (.agents/plans/<kind>/*.md, discriminator `kind`)
 */

import { z } from "zod/v4";
import {
  PLAN_KINDS,
  PLAN_PRIORITIES,
  PLAN_CLASSIFICATIONS,
  PLAN_RELATIONSHIP_KINDS,
} from "../../db/schema/plan/plan-kinds";

// Relative-only RULE_SEVERITIES constant; declaring inline so this module
// can be bundled into the CLI (tsconfig.cli.json doesn't include @/* aliases
// or src/db/schema/rule.ts in its rootDir scope).
const RULE_SEVERITIES = ["info", "warn", "error"] as const;

// ---------------------------------------------------------------------------
// Skill — .agents/skills/*.md
// ---------------------------------------------------------------------------

export const RISK_CLASSES = ["low", "medium", "high", "critical"] as const;
export const SENSITIVITY_VALUES = ["conservative", "balanced", "thorough"] as const;

const planTransitionTriggerSchema = z.object({
  planKind: z.enum(PLAN_KINDS),
  transitionTo: z.enum([
    "draft",
    "in_review",
    "approved",
    "in_progress",
    "completed",
    "rejected",
    "changes_requested",
    "cancelled",
  ]),
});

const webhookTriggerSchema = z.object({
  webhook: z.enum(["pr_opened", "pr_synchronize", "pr_closed", "issue_opened", "deployment_status"]),
  pathGlobs: z.array(z.string()).optional(),
});

export const skillTriggerSchema = z.union([planTransitionTriggerSchema, webhookTriggerSchema]);

export const skillFileFrontmatterSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "slug must be lowercase kebab-case"),
  name: z.string().min(1),
  description: z.string().min(1),
  model: z.string().optional(),
  requiredLevel: z.number().int().min(0).max(3).optional(),
  riskClass: z.enum(RISK_CLASSES).optional(),
  sensitivity: z.enum(SENSITIVITY_VALUES).optional(),
  triggers: z.array(skillTriggerSchema).optional(),
});

export type SkillFileFrontmatter = z.infer<typeof skillFileFrontmatterSchema>;
export type SkillTrigger = z.infer<typeof skillTriggerSchema>;

// ---------------------------------------------------------------------------
// Rule — .agents/rules/*.md
// ---------------------------------------------------------------------------

const keywordPresenceConfigSchema = z.object({
  requires: z.array(z.string()).optional(),
  forbids: z.array(z.string()).optional(),
  caseSensitive: z.boolean().optional(),
});

const keywordPresenceAppliesToSchema = z.object({
  planKinds: z.array(z.enum(PLAN_KINDS)).optional(),
  onTransition: z
    .array(z.object({ from: z.string(), to: z.string() }))
    .optional(),
});

const actionPolicyConfigSchema = z.object({
  blockedActions: z
    .array(
      z.object({
        tool: z.string(),
        pathGlob: z.string().optional(),
        commandGlob: z.string().optional(),
        minLevel: z.number().int().min(0).max(3).optional(),
        always: z.boolean().optional(),
      }),
    )
    .optional(),
  // Legacy short-form (used by the existing rule-engine).
  blockedPaths: z.array(z.string()).optional(),
  requireTests: z.boolean().optional(),
  maxFilesPerChange: z.number().int().positive().optional(),
  maxLoc: z.number().int().positive().optional(),
  minCoverage: z.number().min(0).max(1).optional(),
});

const actionPolicyAppliesToSchema = z.object({
  skills: z.array(z.string()).optional(),
});

const autonomyThresholdConfigSchema = z.object({
  actionKind: z.string(),
  changeRisk: z.enum(RISK_CLASSES),
  minLevel: z.number().int().min(0).max(3),
});

const autonomyThresholdAppliesToSchema = z.object({
  paths: z.array(z.string()).optional(),
});

const ruleCommonFields = {
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "slug must be lowercase kebab-case"),
  name: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(RULE_SEVERITIES).optional(),
  enabled: z.boolean().optional(),
};

export const ruleFileFrontmatterSchema = z.discriminatedUnion("validator", [
  z.object({
    ...ruleCommonFields,
    validator: z.literal("keyword-presence"),
    appliesTo: keywordPresenceAppliesToSchema,
    config: keywordPresenceConfigSchema,
  }),
  z.object({
    ...ruleCommonFields,
    validator: z.literal("action-policy"),
    appliesTo: actionPolicyAppliesToSchema,
    config: actionPolicyConfigSchema,
  }),
  z.object({
    ...ruleCommonFields,
    validator: z.literal("autonomy-threshold"),
    appliesTo: autonomyThresholdAppliesToSchema.optional(),
    config: autonomyThresholdConfigSchema,
  }),
]);

export type RuleFileFrontmatter = z.infer<typeof ruleFileFrontmatterSchema>;

// ---------------------------------------------------------------------------
// Plan — .agents/plans/<kind>/*.md
// ---------------------------------------------------------------------------

const relationshipEntrySchema = z.object({
  kind: z.enum(PLAN_RELATIONSHIP_KINDS),
  target: z.string(),
});

const commonPlanFields = {
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "slug must be lowercase kebab-case"),
  kind: z.enum(PLAN_KINDS).optional(),
  title: z.string().min(1),
  summary: z.string().optional(),
  priority: z.enum(PLAN_PRIORITIES).optional(),
  classifications: z.array(z.enum(PLAN_CLASSIFICATIONS)).optional(),
  assignee: z.string().optional(),
  externalRef: z.string().optional(),
  relationships: z.array(relationshipEntrySchema).optional(),
  // Shorthand sugar — resolved into `relationships` at import time.
  parent: z.string().optional(),
  supersedes: z.string().optional(),
  derivedFrom: z.string().optional(),
  relatesTo: z.array(z.string()).optional(),
};

// Per-kind details schemas. These match the dev-authoring-surface spec §7.3
// shapes; on import they're persisted to plan_artifacts.details JSONB and
// re-validated by src/lib/plan/schemas.ts.

const specDetailsSchema = z
  .object({
    acceptanceCriteria: z.array(z.string()).optional(),
    rolloutPlan: z.string().optional(),
    scope: z.string().optional(),
    apis: z.array(z.string()).optional(),
    dataModel: z.string().optional(),
    edgeCases: z.array(z.string()).optional(),
    notes: z.string().optional(),
  })
  .partial();

const adrDetailsSchema = z
  .object({
    decision: z.string().optional(),
    context: z.string().optional(),
    alternatives: z.array(z.string()).optional(),
    alternativesConsidered: z.array(z.string()).optional(),
    consequences: z.array(z.string()).optional(),
    notes: z.string().optional(),
  })
  .partial();

const testPlanDetailsSchema = z
  .object({
    scope: z.union([z.string(), z.array(z.string())]).optional(),
    coverageTarget: z.string().optional(),
    coverageGoal: z.number().min(0).max(1).optional(),
    strategy: z.string().optional(),
    scenarios: z.array(z.string()).optional(),
    testCases: z
      .array(
        z.object({
          name: z.string(),
          given: z.string().optional(),
          when: z.string().optional(),
          then: z.string().optional(),
        }),
      )
      .optional(),
    notes: z.string().optional(),
  })
  .partial();

const riskRegisterDetailsSchema = z
  .object({
    risks: z
      .array(
        z.object({
          id: z.string().optional(),
          description: z.string(),
          likelihood: z.enum(["low", "medium", "high"]).optional(),
          impact: z.enum(["low", "medium", "high"]).optional(),
          mitigation: z.string().optional(),
          owner: z.string().optional(),
        }),
      )
      .optional(),
    notes: z.string().optional(),
  })
  .partial();

const releasePlanDetailsSchema = z
  .object({
    targetDate: z.string().optional(),
    version: z.string().optional(),
    included: z.array(z.string()).optional(),
    rolloutPlan: z.string().optional(),
    rollbackPlan: z.string().optional(),
    rolloutSteps: z.array(z.string()).optional(),
    goNoGoChecks: z.array(z.string()).optional(),
    notes: z.string().optional(),
  })
  .partial();

const epicDetailsSchema = z
  .object({
    objective: z.string().optional(),
    successMetrics: z.array(z.string()).optional(),
    targetQuarter: z.string().optional(),
    notes: z.string().optional(),
  })
  .partial();

const featureDetailsSchema = z
  .object({
    userValue: z.string().optional(),
    acceptanceCriteria: z.array(z.string()).optional(),
    notes: z.string().optional(),
  })
  .partial();

const storyDetailsSchema = z
  .object({
    asA: z.string().optional(),
    iWant: z.string().optional(),
    soThat: z.string().optional(),
    acceptanceCriteria: z.array(z.string()).optional(),
    notes: z.string().optional(),
  })
  .partial();

/**
 * MVP scope per spec §3 only file-authors spec/adr/test_plan/risk_register/
 * release_plan. epic/feature/story stay in Jira/Linear; incident is never
 * file-authored. We accept all kinds here defensively so that a stray epic.md
 * file produces a clear validation error rather than a silent ignore.
 */
export const planFileFrontmatterSchema = z.discriminatedUnion("kind", [
  z.object({ ...commonPlanFields, kind: z.literal("spec"), details: specDetailsSchema.optional() }),
  z.object({ ...commonPlanFields, kind: z.literal("adr"), details: adrDetailsSchema.optional() }),
  z.object({
    ...commonPlanFields,
    kind: z.literal("test_plan"),
    details: testPlanDetailsSchema.optional(),
  }),
  z.object({
    ...commonPlanFields,
    kind: z.literal("risk_register"),
    details: riskRegisterDetailsSchema.optional(),
  }),
  z.object({
    ...commonPlanFields,
    kind: z.literal("release_plan"),
    details: releasePlanDetailsSchema.optional(),
  }),
  z.object({ ...commonPlanFields, kind: z.literal("epic"), details: epicDetailsSchema.optional() }),
  z.object({
    ...commonPlanFields,
    kind: z.literal("feature"),
    details: featureDetailsSchema.optional(),
  }),
  z.object({
    ...commonPlanFields,
    kind: z.literal("story"),
    details: storyDetailsSchema.optional(),
  }),
]);

export type PlanFileFrontmatter = z.infer<typeof planFileFrontmatterSchema>;

/**
 * Resolve the shorthand relationship fields (parent/supersedes/derivedFrom/
 * relatesTo) into the canonical `relationships` array per spec §7.2.
 */
export function resolvePlanRelationships(
  fm: PlanFileFrontmatter,
): Array<{ kind: (typeof PLAN_RELATIONSHIP_KINDS)[number]; target: string }> {
  const out: Array<{ kind: (typeof PLAN_RELATIONSHIP_KINDS)[number]; target: string }> = [];
  if (fm.relationships) out.push(...fm.relationships);
  if (fm.parent) out.push({ kind: "parent_of", target: fm.parent });
  if (fm.supersedes) out.push({ kind: "supersedes", target: fm.supersedes });
  if (fm.derivedFrom) out.push({ kind: "derived_from", target: fm.derivedFrom });
  for (const target of fm.relatesTo ?? []) {
    out.push({ kind: "relates_to", target });
  }
  return out;
}
