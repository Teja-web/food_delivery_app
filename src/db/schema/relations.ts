import { relations } from "drizzle-orm";
import { roles } from "./roles";
import { candidates, orgCandidates } from "./candidates";
import { matches } from "./matches";
import { applications } from "./applications";
import { interviews, interviewStages, interviewPanelists, scorecards } from "./interviews";
import { offers, offerVersions } from "./offers";
import { offerChecklistItems } from "./offers";
import { pools } from "./pools";
import { poolMembers } from "./pools";
import { assessments, assessmentQuestions, assessmentAttempts } from "./assessments";
import { engagements } from "./engagements";
import { departments } from "./organization";
import { orgIdentity } from "./organization";
import { user } from "./auth";
import {
  candidateIntelligence,
  applicationIntelligence,
  interviewIntelligence,
  offerIntelligence,
  engagementIntelligence,
  assessmentIntelligence,
} from "./intelligence";
import { interviewMockSessions } from "./mock-sessions";

export const rolesRelations = relations(roles, ({ one, many }) => ({
  hiringManager: one(user, { fields: [roles.hiringManagerId], references: [user.id], relationName: "roleHiringManager" }),
  recruiter: one(user, { fields: [roles.recruiterId], references: [user.id], relationName: "roleRecruiter" }),
  matches: many(matches),
  applications: many(applications),
  interviewStages: many(interviewStages),
}));

export const candidatesRelations = relations(candidates, ({ one, many }) => ({
  matches: many(matches),
  applications: many(applications),
  poolMemberships: many(poolMembers),
  orgMemberships: many(orgCandidates),
  intelligence: one(candidateIntelligence),
}));

export const matchesRelations = relations(matches, ({ one, many }) => ({
  role: one(roles, { fields: [matches.roleId], references: [roles.id] }),
  candidate: one(candidates, { fields: [matches.candidateId], references: [candidates.id] }),
  applications: many(applications),
}));

export const orgCandidatesRelations = relations(orgCandidates, ({ one }) => ({
  candidate: one(candidates, { fields: [orgCandidates.candidateId], references: [candidates.id] }),
}));

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  role: one(roles, { fields: [applications.roleId], references: [roles.id] }),
  candidate: one(candidates, { fields: [applications.candidateId], references: [candidates.id] }),
  match: one(matches, { fields: [applications.matchId], references: [matches.id] }),
  interviews: many(interviews),
  offers: many(offers),
  assessmentAttempts: many(assessmentAttempts),
  intelligence: one(applicationIntelligence),
}));

export const interviewStagesRelations = relations(interviewStages, ({ one }) => ({
  role: one(roles, { fields: [interviewStages.roleId], references: [roles.id] }),
}));

export const interviewsRelations = relations(interviews, ({ one, many }) => ({
  application: one(applications, { fields: [interviews.applicationId], references: [applications.id] }),
  stage: one(interviewStages, { fields: [interviews.stageId], references: [interviewStages.id] }),
  scorecards: many(scorecards),
  intelligence: one(interviewIntelligence),
  panelists: many(interviewPanelists),
  mockSessions: many(interviewMockSessions),
  liveAssessmentAttempts: many(assessmentAttempts),
}));

export const interviewMockSessionsRelations = relations(interviewMockSessions, ({ one }) => ({
  interview: one(interviews, { fields: [interviewMockSessions.interviewId], references: [interviews.id] }),
  candidate: one(candidates, { fields: [interviewMockSessions.candidateId], references: [candidates.id] }),
}));

export const interviewIntelligenceRelations = relations(interviewIntelligence, ({ one }) => ({
  interview: one(interviews, { fields: [interviewIntelligence.interviewId], references: [interviews.id] }),
}));

export const interviewPanelistsRelations = relations(interviewPanelists, ({ one }) => ({
  interview: one(interviews, { fields: [interviewPanelists.interviewId], references: [interviews.id] }),
  user: one(user, { fields: [interviewPanelists.userId], references: [user.id] }),
}));

export const scorecardsRelations = relations(scorecards, ({ one }) => ({
  interview: one(interviews, { fields: [scorecards.interviewId], references: [interviews.id] }),
}));

export const offersRelations = relations(offers, ({ one, many }) => ({
  application: one(applications, { fields: [offers.applicationId], references: [applications.id] }),
  checklistItems: many(offerChecklistItems),
  intelligence: one(offerIntelligence),
  versions: many(offerVersions),
}));

export const offerChecklistItemsRelations = relations(offerChecklistItems, ({ one }) => ({
  offer: one(offers, { fields: [offerChecklistItems.offerId], references: [offers.id] }),
}));

export const offerVersionsRelations = relations(offerVersions, ({ one }) => ({
  offer: one(offers, { fields: [offerVersions.offerId], references: [offers.id] }),
}));

export const poolsRelations = relations(pools, ({ many }) => ({
  members: many(poolMembers),
}));

export const poolMembersRelations = relations(poolMembers, ({ one }) => ({
  pool: one(pools, { fields: [poolMembers.poolId], references: [pools.id] }),
  candidate: one(candidates, { fields: [poolMembers.candidateId], references: [candidates.id] }),
}));

export const assessmentsRelations = relations(assessments, ({ many }) => ({
  questions: many(assessmentQuestions),
  attempts: many(assessmentAttempts),
}));

export const assessmentQuestionsRelations = relations(assessmentQuestions, ({ one }) => ({
  assessment: one(assessments, { fields: [assessmentQuestions.assessmentId], references: [assessments.id] }),
}));

export const assessmentAttemptsRelations = relations(assessmentAttempts, ({ one }) => ({
  assessment: one(assessments, { fields: [assessmentAttempts.assessmentId], references: [assessments.id] }),
  candidate: one(candidates, { fields: [assessmentAttempts.candidateId], references: [candidates.id] }),
  application: one(applications, { fields: [assessmentAttempts.applicationId], references: [applications.id] }),
  interview: one(interviews, { fields: [assessmentAttempts.interviewId], references: [interviews.id] }),
  intelligence: one(assessmentIntelligence),
}));

// -- Intelligence table relations --------------------------------------

export const candidateIntelligenceRelations = relations(candidateIntelligence, ({ one }) => ({
  candidate: one(candidates, { fields: [candidateIntelligence.candidateId], references: [candidates.id] }),
}));

export const applicationIntelligenceRelations = relations(applicationIntelligence, ({ one }) => ({
  application: one(applications, { fields: [applicationIntelligence.applicationId], references: [applications.id] }),
}));

export const offerIntelligenceRelations = relations(offerIntelligence, ({ one }) => ({
  offer: one(offers, { fields: [offerIntelligence.offerId], references: [offers.id] }),
}));

export const engagementIntelligenceRelations = relations(engagementIntelligence, ({ one }) => ({
  engagement: one(engagements, { fields: [engagementIntelligence.engagementId], references: [engagements.id] }),
}));

export const assessmentIntelligenceRelations = relations(assessmentIntelligence, ({ one }) => ({
  attempt: one(assessmentAttempts, { fields: [assessmentIntelligence.attemptId], references: [assessmentAttempts.id] }),
}));
