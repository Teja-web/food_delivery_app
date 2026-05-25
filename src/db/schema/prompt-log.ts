/**
 * PromptLog — per-turn capture of a developer prompt in the IDE agent loop.
 *
 * Coznt's `invoke_skill` chokepoint governs *skill-invocation*; this table
 * closes the gap on *agent-loop* observability — every USER / ASSISTANT /
 * SYSTEM message the host LLM sees can be persisted and graded against the
 * canonical rubric in `src/lib/prompt-quality/rubric.ts`.
 *
 * Sessions are tracked as `audit_logs` rows with `entity_type='mcp_session'`
 * (no standalone sessions table exists). `mcpSessionId` is stored as plain
 * text — it correlates with `audit_logs.entity_id` for replay but is not an
 * FK because audit_logs is append-only.
 *
 * Rows scored NEEDS_IMPROVEMENT / POOR feed `recomputeSkillAutonomy()` via
 * `skill_outcomes.sourceKind='prompt_quality_signal'` as a *leading*
 * indicator that attenuates promotion but never triggers demotion.
 */

import { text, timestamp, integer, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";
import { projects } from "./project";

export const PROMPT_ROLES = ["USER", "ASSISTANT", "SYSTEM"] as const;
export type PromptRole = (typeof PROMPT_ROLES)[number];

export const VIBE_CODING_TOOLS = [
  "CURSOR",
  "CLAUDE_CODE",
  "COPILOT",
  "WINDSURF",
  "CODEX",
  "OTHER",
] as const;
export type VibeCodingTool = (typeof VIBE_CODING_TOOLS)[number];

export const PROMPT_QUALITY_TIERS = ["GOOD", "NEEDS_IMPROVEMENT", "POOR"] as const;
export type PromptQualityTier = (typeof PROMPT_QUALITY_TIERS)[number];

export const promptLogs = cozntSchema.table(
  "prompt_logs",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),

    /**
     * MCP session id — the nanoid returned by POST /api/v1/mcp/sessions
     * and stored in audit_logs.entity_id. Not an FK (sessions live in
     * audit_logs, which is append-only). May be null for prompts captured
     * via the hook before session_start fires.
     */
    mcpSessionId: text("mcp_session_id"),

    role: text().$type<PromptRole>().notNull().default("USER"),
    source: text().$type<VibeCodingTool>().notNull().default("OTHER"),
    content: text().notNull(),

    /**
     * Cached project phase at capture time. The hook reads this from
     * `.coznt/project-phase.txt` for offline scoring; the server-side
     * resolver fills it from `projects.phase` when missing.
     */
    phase: text(),

    /** Local git identity of the developer who typed the prompt. */
    authorName: text("author_name"),
    authorUsername: text("author_username"),
    authorEmail: text("author_email"),

    /**
     * Idempotency key supplied by the hook / client. The unique index
     * below means a retry with the same (projectId, clientLocalId) is a
     * no-op insert.
     */
    clientLocalId: text("client_local_id"),

    /** 0–100. Null until scored. */
    promptScore: integer("prompt_score"),
    promptTier: text("prompt_tier").$type<PromptQualityTier>(),
    /**
     * Full scorer output: { dimensions: { clarity, context, … }, suggestions, flags }.
     */
    promptScoreDetail: jsonb("prompt_score_detail").$type<Record<string, unknown>>(),
    rubricVersion: text("rubric_version"),
    scoredAt: timestamp("scored_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("prompt_logs_project_time_idx").on(table.projectId, table.createdAt),
    index("prompt_logs_project_tier_idx").on(table.projectId, table.promptTier),
    index("prompt_logs_session_idx").on(table.mcpSessionId),
    uniqueIndex("prompt_logs_client_local_unique")
      .on(table.projectId, table.clientLocalId)
      .where(sql`${table.clientLocalId} is not null`),
    index("prompt_logs_fts_idx").using("gin", sql`coznt.fts_vector(${table.content})`),
  ],
);

export type PromptLog = typeof promptLogs.$inferSelect;
export type NewPromptLog = typeof promptLogs.$inferInsert;
