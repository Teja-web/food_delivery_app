import { text, integer, timestamp, jsonb, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";
import { applications } from "./applications";
import { candidates } from "./candidates";
import { interviews } from "./interviews";

// --- Assessment Enums --------------------------------------------------------

export const ASSESSMENT_TYPES = ["technical", "personality", "aptitude", "coding", "case_study", "interview_rubric", "practice", "custom"] as const;
export type AssessmentType = typeof ASSESSMENT_TYPES[number];

export const ASSESSMENT_ORIGINS = ["org_created", "ai_practice", "ai_rapid_fire", "ai_mock_interview"] as const;
export type AssessmentOrigin = typeof ASSESSMENT_ORIGINS[number];

export const ASSESSMENT_STATUSES = ["draft", "active", "archived"] as const;
export type AssessmentStatus = typeof ASSESSMENT_STATUSES[number];

export const ASSESSMENT_VISIBILITIES = ["private", "public", "shared"] as const;
export type AssessmentVisibility = typeof ASSESSMENT_VISIBILITIES[number];

export const QUESTION_TYPES = ["SHORT_TEXT", "LONG_TEXT", "MCQ", "MULTI_SELECT", "CODING_SNIPPET", "SCALE", "BOOLEAN"] as const;
export type QuestionType = typeof QUESTION_TYPES[number];

export const ATTEMPT_STATUSES = ["pending", "in-progress", "submitted", "evaluated", "completed", "expired", "cancelled"] as const;
export type AttemptStatus = typeof ATTEMPT_STATUSES[number];

export const assessments = dillizntSchema.table("assessments", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").$type<AssessmentType>().notNull().default("custom"),
  origin: text("origin").$type<AssessmentOrigin>().notNull().default("org_created"),
  config: jsonb("config"),
  visibility: text("visibility").$type<AssessmentVisibility>().notNull().default("public"),
  status: text("status").$type<AssessmentStatus>().notNull().default("draft"),
  actorType: text("actor_type"),
  actorId: text("actor_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdById: text("created_by_id"),
  createdByName: text("created_by_name"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedById: text("updated_by_id"),
  updatedByName: text("updated_by_name"),
}, (table) => [
  index("assessments_org_idx").on(table.organizationId),
  index("assessments_status_idx").on(table.status),
]);

export const assessmentQuestions = dillizntSchema.table("assessment_questions", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  assessmentId: text("assessment_id").notNull().references(() => assessments.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  type: text("type").$type<QuestionType>().notNull().default("SHORT_TEXT"),
  order: integer("order").default(0),
  weight: integer("weight").default(1),
  options: jsonb("options"),
  correctAnswer: jsonb("correct_answer"),
  rubric: jsonb("rubric"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("assessment_questions_assessment_idx").on(table.assessmentId),
]);

export const assessmentAttempts = dillizntSchema.table("assessment_attempts", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  assessmentId: text("assessment_id").notNull().references(() => assessments.id, { onDelete: "cascade" }),
  candidateId: text("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  applicationId: text("application_id").references(() => applications.id, { onDelete: "set null" }),
  interviewId: text("interview_id").references(() => interviews.id, { onDelete: "set null" }),
  status: text("status").$type<AttemptStatus>().notNull().default("pending"),
  score: integer("score"),
  answers: jsonb("answers").default({}),
  evaluation: jsonb("evaluation"),
  startedAt: timestamp("started_at"),
  submittedAt: timestamp("submitted_at"),
  evaluatedAt: timestamp("evaluated_at"),
  deadlineAt: timestamp("deadline_at"),
  actorType: text("actor_type"),
  actorId: text("actor_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdById: text("created_by_id"),
  createdByName: text("created_by_name"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedById: text("updated_by_id"),
  updatedByName: text("updated_by_name"),
}, (table) => [
  index("assessment_attempts_org_idx").on(table.organizationId),
  index("assessment_attempts_assessment_idx").on(table.assessmentId),
  index("assessment_attempts_candidate_idx").on(table.candidateId),
  index("assessment_attempts_application_idx").on(table.applicationId),
  index("assessment_attempts_interview_idx").on(table.interviewId),
  check("assessment_attempts_score_check", sql`${table.score} >= 0 AND ${table.score} <= 100`),
]);

export type Assessment = typeof assessments.$inferSelect;
export type NewAssessment = typeof assessments.$inferInsert;
export type AssessmentQuestion = typeof assessmentQuestions.$inferSelect;
export type NewAssessmentQuestion = typeof assessmentQuestions.$inferInsert;
export type AssessmentAttempt = typeof assessmentAttempts.$inferSelect;
export type NewAssessmentAttempt = typeof assessmentAttempts.$inferInsert;
