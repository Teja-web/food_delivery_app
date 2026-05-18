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
  phase: z.string(),
  url: z.string(),
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
  phase: z.string().nullable(),
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

/**
 * Per-phase tool boundary surfaced to MCP consumers. Borrowed from the
 * ai-sdlc-framework `sdlc-governance.mdc` discipline model: the agent
 * uses these to self-police what it can and can't do in the current phase.
 */
export const McpPhaseDisciplineSchema = z.object({
  label: z.string(),
  description: z.string(),
  allowed: z.array(z.string()),
  forbidden: z.array(z.string()),
  nextCondition: z.string(),
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

export const McpResponseSchema = z.object({
  project: McpProjectSchema,
  workItem: McpWorkItemSchema.nullable(),
  phaseDiscipline: McpPhaseDisciplineSchema,
  /**
   * Names of MCP tools the agent may call in the current phase. Sourced
   * from `src/lib/mcp/phase-enforcement.ts`. The agent self-polices by
   * checking proposed tool calls against this list before invoking.
   */
  allowedTools: z.array(z.string()),
  rules: z.array(McpRuleSchema),
  skills: z.array(McpSkillSchema),
  adrs: z.array(McpAdrSchema),
  /**
   * Pinned + recent learnings for this project. Empty when no learnings
   * have been authored. Surfaces on every `get_my_context` call so the
   * agent sees them before deciding what to do.
   */
  learnings: z.array(McpLearningSchema),
  meta: McpMetaSchema,
});
export type McpResponse = z.infer<typeof McpResponseSchema>;
