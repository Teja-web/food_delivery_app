/**
 * Skill — a reusable agent workflow (system prompt + I/O schema).
 *
 * Callable over the HTTP API by any agent (Cursor, Claude Code, Aider, CI).
 * `projectId` null = org-wide skill available to every project.
 */

import { text, timestamp, boolean, jsonb, integer, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cozntSchema } from "../schema";
import { projects } from "../project";

export const skills = cozntSchema.table(
  "skills",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    /** null = available to every project in the org. */
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),

    slug: text().notNull(),
    name: text().notNull(),
    description: text(),
    body: text().notNull(),

    /** JSON-schema-compatible shapes; can be derived from Zod. */
    inputSchema: jsonb("input_schema").$type<Record<string, unknown>>(),
    outputSchema: jsonb("output_schema").$type<Record<string, unknown>>(),

    tags: text().array(),
    enabled: boolean().notNull().default(true),

    /**
     * Minimum autonomy level (0–3) the skill must hold on a project before the
     * Milestone-D dispatch gate lets a tool call through. Below this, the
     * PreToolUse handler denies the call and routes a `skill_invocation`
     * approval into the inbox.
     */
    minAutonomyLevel: integer("min_autonomy_level").notNull().default(0),

    /**
     * Authoring fields per docs/spec/dev-authoring-surface.md §19. When
     * `claimed_path` is non-null the skill is file-managed: definition fields
     * (body, slug, name, config.triggers) are only writable by the merge
     * webhook. Web-app edits are blocked on these columns.
     */
    claimedPath: text("claimed_path"),
    /** Runtime tightening of minAutonomyLevel. Null = use base. Tighten only. */
    requiredLevelOverride: integer("required_level_override"),
    /** Runtime sensitivity override: conservative | balanced | thorough. */
    sensitivityOverride: text("sensitivity_override"),
    /** Temporary pin to level 0 until this timestamp (reactive demotion). */
    autonomyOverrideUntil: timestamp("autonomy_override_until"),
    /** Risk band: low | medium | high | critical. Default `medium`. */
    riskClass: text("risk_class").notNull().default("medium"),
    /**
     * Authoring config JSONB: model, sensitivity, triggers. Shape validated
     * by src/lib/authoring/schemas.ts (skillFileFrontmatterSchema).
     */
    config: jsonb().$type<Record<string, unknown>>(),

    createdById: text("created_by_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("skills_org_idx").on(table.organizationId),
    index("skills_project_idx").on(table.projectId),
    index("skills_claimed_path_idx").on(table.organizationId, table.claimedPath),
    index("skills_fts_idx").using(
      "gin",
      sql`coznt.fts_vector(${table.name}, ${table.description}, ${table.body})`,
    ),
  ],
);

export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
