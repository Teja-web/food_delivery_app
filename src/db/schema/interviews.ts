import { text, integer, timestamp, jsonb, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";
import { roles } from "./roles";
import { applications } from "./applications";

// -- Scheduling types ------------------------------------------------

export interface ProposedSlot {
  startAt: string; // ISO timestamp
  endAt: string;   // ISO timestamp
}

// -- Interview Stages ---------------------���----------------------------

export const interviewStages = dillizntSchema.table("interview_stages", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  roleId: text("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type"),
  durationMins: integer("duration_mins"),
  competencies: text("competencies").array(),
  order: integer("order").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("recruit_interview_stages_role_idx").on(table.roleId),
]);

export type InterviewStage = typeof interviewStages.$inferSelect;
export type NewInterviewStage = typeof interviewStages.$inferInsert;

// -�� Interviews --------���-----------------------------------------------

export const interviews = dillizntSchema.table("interviews", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  candidateId: text("candidate_id").notNull(),
  roleId: text("role_id").notNull(),
  applicationId: text("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  stageId: text("stage_id").references(() => interviewStages.id),
  interviewType: text("interview_type"),
  scheduledAt: timestamp("scheduled_at"),
  durationMins: integer("duration_mins").default(45),
  meetingLink: text("meeting_link"),
  location: text("location"),
  /** @deprecated Moving to interview_intelligence table. Keep for backward compat during migration. */
  evidenceTarget: text("evidence_target"),
  /** @deprecated Moving to interview_intelligence table. Keep for backward compat during migration. */
  transcript: text("transcript"),
  notes: text("notes"),
  status: text("status").notNull().default("proposed"), // proposed | confirmed | completed | cancelled | declined
  proposedSlots: jsonb("proposed_slots").$type<ProposedSlot[]>(),
  confirmedAt: timestamp("confirmed_at"),
  /** Stores JSON mapping userId -> Google Calendar eventId for each panelist */
  calendarEventId: text("calendar_event_id"),
  candidateToken: text("candidate_token").$defaultFn(() => nanoid(32)),
  recordingEgressId: text("recording_egress_id"),
  recordingUrl: text("recording_url"),
  recordingStatus: text("recording_status", {
    enum: ["none", "recording", "processing", "ready"],
  }).default("none"),
  proctored: boolean("proctored").default(false).notNull(),
  actorType: text("actor_type"),
  actorId: text("actor_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdById: text("created_by_id"),
  createdByName: text("created_by_name"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedById: text("updated_by_id"),
  updatedByName: text("updated_by_name"),
}, (table) => [
  index("recruit_interviews_org_idx").on(table.organizationId),
  index("recruit_interviews_pipeline_idx").on(table.applicationId),
  index("recruit_interviews_status_idx").on(table.status),
  index("recruit_interviews_fts_idx").using("gin", sql`dilliznt.fts_vector(${table.interviewType}, ${table.notes}, ${table.transcript})`),
  uniqueIndex("recruit_interviews_candidate_token_idx").on(table.candidateToken),
]);

export type Interview = typeof interviews.$inferSelect;
export type NewInterview = typeof interviews.$inferInsert;

// -- Interview Panelists -----------------------------------------------

export const interviewPanelists = dillizntSchema.table("interview_panelists", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  interviewId: text("interview_id").notNull().references(() => interviews.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  role: text("role").notNull().default("interviewer"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("recruit_interview_panelists_interview_idx").on(table.interviewId),
  index("recruit_interview_panelists_user_idx").on(table.userId),
]);

export type InterviewPanelist = typeof interviewPanelists.$inferSelect;
export type NewInterviewPanelist = typeof interviewPanelists.$inferInsert;

// -- Scorecards ------���-------------------------------------------------

export interface ScorecardRatingEntry {
  competency: string;
  rating: number;
  evidence: string;
}

export const scorecards = dillizntSchema.table("interview_scorecards", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  interviewId: text("interview_id").notNull().references(() => interviews.id, { onDelete: "cascade" }),
  reviewerId: text("reviewer_id"),
  reviewerName: text("reviewer_name"),
  ratings: jsonb("ratings").$type<ScorecardRatingEntry[]>(),
  overallRating: integer("overall_rating"),
  verdict: text("verdict"),
  notes: text("notes"),
  actorType: text("actor_type"),
  actorId: text("actor_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdById: text("created_by_id"),
  createdByName: text("created_by_name"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedById: text("updated_by_id"),
  updatedByName: text("updated_by_name"),
}, (table) => [
  index("recruit_interview_scorecards_org_idx").on(table.organizationId),
  index("recruit_interview_scorecards_interview_idx").on(table.interviewId),
  index("recruit_interview_scorecards_fts_idx").using("gin", sql`dilliznt.fts_vector(${table.reviewerName}, ${table.verdict}, ${table.notes})`),
]);

export type Scorecard = typeof scorecards.$inferSelect;
export type NewScorecard = typeof scorecards.$inferInsert;
