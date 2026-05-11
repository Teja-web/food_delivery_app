import { text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";
import { interviews } from "./interviews";
import { candidates } from "./candidates";
import { roles } from "./roles";

// -- Types ------------------------------------------------------

export interface MockSessionTranscriptEntry {
  role: "user" | "assistant";
  content: string;
}

export interface MockSessionEvaluation {
  readinessScore: number; // 0-100
  communicationScore: number; // 0-100
  contentScore: number; // 0-100
  summary: string;
  strengths: string[];
  improvements: string[];
  competencySignals: Array<{
    competency: string;
    score: number; // 0-100
    evidence: string;
  }>;
}

// -- Table ------------------------------------------------------

export const interviewMockSessions = dillizntSchema.table("interview_mock_sessions", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  interviewId: text("interview_id").references(() => interviews.id, { onDelete: "cascade" }),
  roleId: text("role_id").references(() => roles.id, { onDelete: "cascade" }),
  candidateId: text("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),

  // Session type
  type: text("type").notNull().$type<"mock_interview" | "practice" | "rapid_fire">(),

  // Content — shape depends on type
  // mock_interview: conversation transcript
  // practice / rapid_fire: Q&A pairs
  transcript: jsonb("transcript").$type<MockSessionTranscriptEntry[]>(),
  questions: jsonb("questions").$type<Array<{
    question: string;
    answer: string;
    category?: string;
    hint?: string;
    whyThisMatters?: string;
    score?: number;
    feedback?: string;
  }>>(),

  // Evaluation — filled by agent post-session
  evaluation: jsonb("evaluation").$type<MockSessionEvaluation>(),
  score: integer("score"), // overall readiness score 0-100

  // Session metadata
  durationSeconds: integer("duration_seconds"),
  status: text("status").notNull().default("completed").$type<"in_progress" | "completed" | "evaluated">(),

  // Timestamps
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  evaluatedAt: timestamp("evaluated_at", { mode: "string" }),
}, (table) => [
  index("interview_mock_sessions_interview_idx").using("btree", table.interviewId),
  index("interview_mock_sessions_candidate_idx").using("btree", table.candidateId),
]);

// Type exports
export type InterviewMockSession = typeof interviewMockSessions.$inferSelect;
export type NewInterviewMockSession = typeof interviewMockSessions.$inferInsert;
