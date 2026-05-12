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
  level: z.enum(["INTERN", "JUNIOR", "SENIOR", "PRINCIPAL"]),
  autonomyDescription: z.string(),
  url: z.string(),
});

export const McpAdrSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
});

export const McpMetaSchema = z.object({
  responseTimeMs: z.number(),
  cacheStatus: z.enum(["fresh", "stale", "miss"]),
  computedAt: z.string(),
});

export const McpResponseSchema = z.object({
  project: McpProjectSchema,
  workItem: McpWorkItemSchema.nullable(),
  rules: z.array(McpRuleSchema),
  skills: z.array(McpSkillSchema),
  adrs: z.array(McpAdrSchema),
  meta: McpMetaSchema,
});
export type McpResponse = z.infer<typeof McpResponseSchema>;
