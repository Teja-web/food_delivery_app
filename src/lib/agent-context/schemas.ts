import { z } from "zod/v4";

export const McpRequestSchema = z.object({
  repoUrl: z.string().optional(),
  branch: z.string().optional(),
  workItemKey: z.string().optional(),
});
export type McpRequest = z.infer<typeof McpRequestSchema>;

export const McpProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  /** Operator-authored "what is this project" description. Null when not set. */
  description: z.string().nullable(),
  url: z.string(),
  /** First-bound GitHub repository URL, when present. */
  repoUrl: z.string().nullable(),
});

export const McpWorkItemSchema = z.object({
  key: z.string(),
  title: z.string(),
  url: z.string().nullable(),
});

export const McpRuleSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: z.string(),
  url: z.string(),
});

export const McpSkillSchema = z.object({
  slug: z.string(),
  level: z.enum(["OBSERVE", "PROPOSE", "MERGE", "LEAD"]),
  autonomyDescription: z.string(),
  url: z.string(),
});

export const McpAdrSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
});

export const McpStandardsSchema = z.object({
  requiredComplete: z.boolean(),
  missingRequired: z.array(z.string()),
  resourceUri: z.literal("coznt://standards"),
  items: z.array(
    z.object({
      kind: z.string(),
      name: z.string(),
      title: z.string(),
      projectArtifactKind: z.enum(["requirements", "design", "custom"]).nullable().optional(),
      scope: z.enum(["org", "project"]),
      version: z.string(),
      hash: z.string(),
      updatedAt: z.string(),
    }),
  ),
});

export const McpMetaSchema = z.object({
  responseTimeMs: z.number(),
  cacheStatus: z.enum(["fresh", "stale", "miss"]),
  computedAt: z.string(),
});

/**
 * Per-project learnings — short operator-authored notes the agent
 * sees at the top of every session. Equivalent to gstack's
 * `~/.gstack/projects/<slug>/learnings.jsonl` but stored server-side
 * and propagated via MCP context (no local cache to stale).
 */
export const McpLearningSchema = z.object({
  id: z.string(),
  body: z.string(),
  pinned: z.boolean(),
  createdAt: z.string(),
  createdByName: z.string().nullable(),
});

/**
 * What the platform recommends as the first action on this project. Null
 * when no routing rule in the active choreography matches current state
 * — the platform never invents a recommendation. Source identifies
 * whether the rule came from a custom org/project choreography or the
 * platform default, so consumers (and the audit log) can attribute it.
 */
export const McpRecommendedKickoffSchema = z.object({
  action: z.string(),
  rationale: z.string(),
  source: z.enum([
    "choreography_custom_project",
    "choreography_custom_org",
    "choreography_default",
  ]),
});

/**
 * Project state snapshot — plans / approvals / governance-gate counts plus
 * verification-debt total. Surfaced on every `get_my_context` so the
 * agent can self-orient without firing N follow-up queries. byKind /
 * byStatus maps include every enum value (zero when absent) so consumers
 * can index without `.has(...)` checks.
 */
export const McpProjectArtifactsSchema = z.object({
  plans: z.object({
    total: z.number().int().nonnegative(),
    byKind: z.record(z.string(), z.number().int().nonnegative()),
    byStatus: z.record(z.string(), z.number().int().nonnegative()),
  }),
  approvals: z.object({
    pendingTotal: z.number().int().nonnegative(),
    oldestOpenAgeHours: z.number().int().nonnegative().nullable(),
  }),
  gates: z.object({
    total: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  }),
  verificationDebt: z.number().nullable(),
});
export type McpProjectArtifacts = z.infer<typeof McpProjectArtifactsSchema>;

/**
 * Session-start greeting payload. The posture file instructs the agent
 * to surface `headline` + `nextActions[0]` on the first user message of
 * a new session. Pure synthesis of `project.description` +
 * `recommendedKickoff` + `projectArtifacts` already in this response —
 * no additional server computation.
 */
export const McpWelcomeSchema = z.object({
  /** One-line greeting the agent says to the user. Always populated. */
  headline: z.string(),
  /** Full project description, when set. */
  summary: z.string().nullable(),
  /** Suggested next actions in priority order. Empty when nothing pressing. */
  nextActions: z.array(z.string()),
});
export type McpWelcome = z.infer<typeof McpWelcomeSchema>;

export const McpResponseSchema = z.object({
  project: McpProjectSchema,
  welcome: McpWelcomeSchema,
  workItem: McpWorkItemSchema.nullable(),
  recommendedKickoff: McpRecommendedKickoffSchema.nullable(),
  currentStage: z.string(),
  projectArtifacts: McpProjectArtifactsSchema,
  rules: z.array(McpRuleSchema),
  skills: z.array(McpSkillSchema),
  adrs: z.array(McpAdrSchema),
  standards: McpStandardsSchema,
  /**
   * Pinned + recent learnings for this project. Empty when no learnings
   * have been authored. Surfaces on every `get_my_context` call so the
   * agent sees them before deciding what to do.
   */
  learnings: z.array(McpLearningSchema),
  meta: McpMetaSchema,
});
export type McpResponse = z.infer<typeof McpResponseSchema>;

