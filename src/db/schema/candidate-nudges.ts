import { text, timestamp, jsonb, index, integer } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";
import { candidates } from "./candidates";

export const NUDGE_TYPES = [
  "interview_prep",
  "streak_broken",
  "evaluation_ready",
  "growth_improved",
  "assessment_available",
] as const;
export type NudgeType = typeof NUDGE_TYPES[number];

export const candidateNudges = dillizntSchema.table("candidate_nudges", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  candidateId: text("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  type: text("type").$type<NudgeType>().notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  actionUrl: text("action_url"),
  priority: integer("priority").notNull().default(3), // 1 = highest, 5 = lowest
  context: jsonb("context"), // arbitrary metadata for the nudge
  dismissedAt: timestamp("dismissed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("candidate_nudges_candidate_idx").on(table.candidateId),
  index("candidate_nudges_active_idx").on(table.candidateId, table.dismissedAt),
]);

export type CandidateNudge = typeof candidateNudges.$inferSelect;
export type NewCandidateNudge = typeof candidateNudges.$inferInsert;
