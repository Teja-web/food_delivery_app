/**
 * Intelligence tables — AI-generated insights for each entity.
 *
 * Each intelligence table is 1:1 with its parent entity and accumulates
 * AI-generated analysis over the entity lifecycle.
 */

import { text, integer, timestamp, jsonb, index, unique } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";
import { candidates } from "./candidates";
import { applications } from "./applications";
import { offers } from "./offers";
import { engagements } from "./engagements";
import { interviews } from "./interviews";
import { assessmentAttempts } from "./assessments";
import { automationLog } from "./automation-log";

// -- Candidate Intelligence --------------------------------------------

export interface CandidateIntelligenceProfile {
  summary: string;
  skills: string[];
  experience: string[];
  education: string[];
  strengths: string[];
  concerns: string[];
  [key: string]: unknown;
}

export interface TalentAssessmentPillar {
  pillar: string;
  weight: number;
  score: number;
  rationale: string;
  signals: string[];
}

export interface TalentAssessment {
  roleFamily: string;
  pillars: TalentAssessmentPillar[];
  overall: number;
  rating: string;
  outlook: string;
  confidence: number;
  gaps: string[];
}

export const candidateIntelligence = dillizntSchema.table("candidate_intelligence", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  candidateId: text("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  profile: jsonb("profile").$type<CandidateIntelligenceProfile>(),
  talentAssessment: jsonb("talent_assessment").$type<TalentAssessment>(),
  evaluationCount: integer("evaluation_count").notNull().default(0),
  lastRunId: text("last_run_id").references(() => automationLog.id),
  lastEvaluatedAt: timestamp("last_evaluated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("recruit_candidate_intel_org_idx").on(table.organizationId),
  unique("recruit_candidate_intel_candidate_uniq").on(table.candidateId),
]);

export type CandidateIntelligenceRow = typeof candidateIntelligence.$inferSelect;
export type NewCandidateIntelligence = typeof candidateIntelligence.$inferInsert;

// -- Application Intelligence ------------------------------------------

export interface EvidenceSummary {
  interviewEvidence: string[];
  assessmentEvidence: string[];
  overallNarrative: string;
  evidenceCoverage: number;
  [key: string]: unknown;
}

export interface FitScore {
  score: number;
  alignment: Array<{ criterion: string; score: number; evidence: string }>;
  recommendation: string;
  signal: string;
  gaps: string[];
  [key: string]: unknown;
}

export interface DecisionReadiness {
  isReady: boolean;
  gaps: string[];
  checkedAt: string;
  [key: string]: unknown;
}

export const applicationIntelligence = dillizntSchema.table("application_intelligence", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  applicationId: text("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  evidenceSummary: jsonb("evidence_summary").$type<EvidenceSummary>(),
  fitScore: jsonb("fit_score").$type<FitScore>(),
  decisionReadiness: jsonb("decision_readiness").$type<DecisionReadiness>(),
  evaluationCount: integer("evaluation_count").notNull().default(0),
  lastRunId: text("last_run_id").references(() => automationLog.id),
  lastEvaluatedAt: timestamp("last_evaluated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("recruit_application_intel_org_idx").on(table.organizationId),
  unique("recruit_application_intel_app_uniq").on(table.applicationId),
]);

export type ApplicationIntelligenceRow = typeof applicationIntelligence.$inferSelect;
export type NewApplicationIntelligence = typeof applicationIntelligence.$inferInsert;

// -- Interview Intelligence --------------------------------------------

export interface InterviewPrepQuestion {
  question: string;
  purpose: string;
  followUps: string[];
  competency: string;
  priority: "must-ask" | "if-time-allows";
}

export interface InterviewPrepRiskFlag {
  flag: string;
  context: string;
  suggestedProbe: string;
}

export interface InterviewPrepScoringGuide {
  competency: string;
  lookFor: string[];
  redFlags: string[];
}

export interface InterviewPrepCompetencyMap {
  competency: string;
  weight: number;
  rationale: string;
}

export interface InterviewPrepOpening {
  talkingPoints: string[];
  candidateQuestionTime: boolean;
}

export interface InterviewPrep {
  briefing: string;
  opening: InterviewPrepOpening;
  questions: InterviewPrepQuestion[];
  focusAreas: string[];
  riskFlags: InterviewPrepRiskFlag[];
  scoringGuidance: InterviewPrepScoringGuide[];
  competencyMap: InterviewPrepCompetencyMap[];
}

// -- Interview Evaluation (unified output from interviewProcessEvidence) ---

export interface InterviewEvaluationAlignment {
  competency: string;
  score: number;
  evidence: string;
  panelAgreement: "unanimous" | "majority" | "split";
}

export interface InterviewEvaluationAssessmentResult {
  assessmentName: string;
  score: number;
  maxScore: number;
  type: string;
  keyFindings: string[];
}

export interface TranscriptCompetencyScore {
  competency: string;
  score: number;
  evidence: string;
}

export interface InterviewEvaluation {
  // Transcript-derived
  topicsDiscussed: string[];
  transcriptCompetencyScores: TranscriptCompetencyScore[];
  keyInsights: string[];
  /** @deprecated Use transcriptCompetencyScores instead */
  candidateEngagement?: number | null;
  /** @deprecated Use transcriptCompetencyScores instead */
  technicalDepthScore?: number | null;
  /** @deprecated Use transcriptCompetencyScores instead */
  communicationScore?: number | null;
  // Scorecard-derived
  alignmentByCompetency: InterviewEvaluationAlignment[];
  evidenceCoverage: number;
  assessmentParagraph: string;
  panelHealth: "complete" | "partial" | "insufficient";
  consensus: string;
  // Shared
  redFlags: string[];
  standoutMoments: string[];
  // Assessment-derived
  assessmentResults: InterviewEvaluationAssessmentResult[];
  // Meta
  evidenceSources: ("transcript" | "scorecards" | "assessments")[];
}

export const interviewIntelligence = dillizntSchema.table("interview_intelligence", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  interviewId: text("interview_id").notNull().references(() => interviews.id, { onDelete: "cascade" }),
  prep: jsonb("prep").$type<InterviewPrep>(),
  evidenceTarget: text("evidence_target"),
  evaluation: jsonb("evaluation").$type<InterviewEvaluation>(),
  evaluationCount: integer("evaluation_count").notNull().default(0),
  lastRunId: text("last_run_id").references(() => automationLog.id),
  lastEvaluatedAt: timestamp("last_evaluated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("recruit_interview_intel_org_idx").on(table.organizationId),
  unique("recruit_interview_intel_interview_uniq").on(table.interviewId),
]);

export type InterviewIntelligenceRow = typeof interviewIntelligence.$inferSelect;
export type NewInterviewIntelligence = typeof interviewIntelligence.$inferInsert;

// -- Offer Intelligence ------------------------------------------------

export interface CloseAnalysis {
  strengthOfOffer: string;
  competitivePosition: string;
  candidateMotivators: string[];
  riskFactors: string[];
  negotiationStrategy: string;
  recommendation: string;
  [key: string]: unknown;
}

export interface LeverageAnalysis {
  leverageScore: number;
  leverageFactors: Array<{ factor: string; signal: string; impact: "increases" | "decreases" }>;
  negotiationStrategy: "aggressive_open" | "market_rate" | "premium_required";
  closeProbability: number;
  [key: string]: unknown;
}

export const offerIntelligence = dillizntSchema.table("offer_intelligence", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  offerId: text("offer_id").notNull().references(() => offers.id, { onDelete: "cascade" }),
  closeAnalysis: jsonb("close_analysis").$type<CloseAnalysis>(),
  leverageAnalysis: jsonb("leverage_analysis").$type<LeverageAnalysis>(),
  offerGeneration: jsonb("offer_generation"),
  evaluationCount: integer("evaluation_count").notNull().default(0),
  lastRunId: text("last_run_id").references(() => automationLog.id),
  lastEvaluatedAt: timestamp("last_evaluated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("recruit_offer_intel_org_idx").on(table.organizationId),
  unique("recruit_offer_intel_offer_uniq").on(table.offerId),
]);

export type OfferIntelligenceRow = typeof offerIntelligence.$inferSelect;
export type NewOfferIntelligence = typeof offerIntelligence.$inferInsert;

// -- Engagement Intelligence -------------------------------------------

export interface EngagementDraft {
  subject: string;
  body: string;
  tone: string;
  personalizationPoints: string[];
  [key: string]: unknown;
}

export const engagementIntelligence = dillizntSchema.table("engagement_intelligence", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id, { onDelete: "cascade" }),
  draft: jsonb("draft").$type<EngagementDraft>(),
  evaluationCount: integer("evaluation_count").notNull().default(0),
  lastRunId: text("last_run_id").references(() => automationLog.id),
  lastEvaluatedAt: timestamp("last_evaluated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("recruit_engagement_intel_org_idx").on(table.organizationId),
  unique("recruit_engagement_intel_eng_uniq").on(table.engagementId),
]);

export type EngagementIntelligenceRow = typeof engagementIntelligence.$inferSelect;
export type NewEngagementIntelligence = typeof engagementIntelligence.$inferInsert;

// -- Assessment Intelligence -------------------------------------------

export interface AssessmentEvaluation {
  score: number;
  rawScore: number;
  totalPoints: number;
  details: Record<string, unknown>;
  [key: string]: unknown;
}

export const assessmentIntelligence = dillizntSchema.table("assessment_intelligence", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  attemptId: text("attempt_id").notNull().references(() => assessmentAttempts.id, { onDelete: "cascade" }),
  evaluation: jsonb("evaluation").$type<AssessmentEvaluation>(),
  evaluationCount: integer("evaluation_count").notNull().default(0),
  lastRunId: text("last_run_id").references(() => automationLog.id),
  lastEvaluatedAt: timestamp("last_evaluated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("recruit_assessment_intel_org_idx").on(table.organizationId),
  unique("recruit_assessment_intel_attempt_uniq").on(table.attemptId),
]);

export type AssessmentIntelligenceRow = typeof assessmentIntelligence.$inferSelect;
export type NewAssessmentIntelligence = typeof assessmentIntelligence.$inferInsert;
