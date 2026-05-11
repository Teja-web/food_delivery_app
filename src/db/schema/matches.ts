/**
 * Matches — the living intelligence layer for role-candidate relationships.
 *
 * A match represents the system's evolving understanding of how well a candidate
 * fits a role. It exists independently of applications: a match is created when
 * the system first evaluates a pair, and continuously updated as new evidence
 * arrives (interviews, scorecards, assessments, profile/criteria changes).
 *
 * An application references a match when a recruiter acts on a recommendation
 * or adds a candidate to a pipeline.
 */

import { text, integer, timestamp, jsonb, index, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";
import { roles } from "./roles";
import { candidates } from "./candidates";

export const MATCH_STATUSES = ["active", "dismissed", "converted", "expired"] as const;
export type MatchStatus = typeof MATCH_STATUSES[number];

export const RECOMMENDATION_LEVELS = ["strong_yes", "yes", "maybe", "no", "strong_no"] as const;
export type RecommendationLevel = typeof RECOMMENDATION_LEVELS[number];

export interface CriterionAlignment {
  criterion: string;
  score: number;
  evidence: string;
  /** Which evidence types informed this criterion score. */
  sources: ("resume" | "interview" | "assessment" | "talent_score")[];
}

export const matches = dillizntSchema.table("matches", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  roleId: text("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  candidateId: text("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),

  /** Composite fit score 0-100, recomputed on every evaluation. */
  fitScore: integer("fit_score"),

  /** System recommendation: strong_yes, yes, maybe, no, strong_no. */
  recommendation: text("recommendation"),

  /** Per-criterion alignment breakdown. Updated as evidence accumulates. */
  alignment: jsonb("alignment").$type<CriterionAlignment[]>(),

  /** How many criteria have direct observed evidence vs. inferred from resume. */
  evidenceCoverage: text("evidence_coverage"),

  /** One-line signal: the strongest reason this candidate fits. */
  signal: text("signal"),

  /** Known gaps or risks. */
  gaps: jsonb("gaps").$type<string[]>(),

  /** Recruiter-facing assessment: 2-3 sentence synthesis with verdict, strengths, gaps, next step. */
  summary: text("summary"),

  /** active = under consideration, dismissed = recruiter passed, converted = became an application, expired = role closed */
  status: text("status").notNull().default("active"),

  /** How many times the system has re-evaluated this match. */
  evaluationCount: integer("evaluation_count").notNull().default(1),

  /** When the system last re-evaluated this match. */
  lastEvaluatedAt: timestamp("last_evaluated_at").defaultNow().notNull(),

  /** When a recruiter dismissed this match (if status = dismissed). */
  dismissedAt: timestamp("dismissed_at"),
  dismissedById: text("dismissed_by_id"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("match_org_idx").on(table.organizationId),
  index("match_role_idx").on(table.roleId),
  index("match_candidate_idx").on(table.candidateId),
  index("match_role_status_idx").on(table.roleId, table.status),
  index("match_fit_score_idx").on(table.fitScore),
  unique("match_role_candidate_uniq").on(table.roleId, table.candidateId),
  check("match_fit_check", sql`${table.fitScore} >= 0 AND ${table.fitScore} <= 100`),
]);

export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
