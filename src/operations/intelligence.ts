import { createEntityCrud } from "@/lib/crud";
import { db } from "@/db/client";
import {
  candidateIntelligence,
  applicationIntelligence,
  interviewIntelligence,
  offerIntelligence,
  engagementIntelligence,
  assessmentIntelligence,
} from "@/db/schema";
import { z } from "zod/v4";
import { safeRevalidate } from "@/lib/safe-revalidate";

// -- Candidate Intelligence --------------------------------------------

const candidateIntelligenceSchema = z.object({
  organizationId: z.string(),
  candidateId: z.string(),
  profile: z.unknown().optional(),
  talentAssessment: z.unknown().optional(),
  evaluationCount: z.number().default(0),
  lastRunId: z.string().optional(),
});

const candidateIntelCrud = createEntityCrud({
  db,
  table: candidateIntelligence,
  queryKey: "candidateIntelligence",
  idField: "id",
  schema: candidateIntelligenceSchema,
  onMutate: () => safeRevalidate("/candidates"),
  getWith: { candidate: true },
});

const getCandidateIntelligenceList = candidateIntelCrud.list;
const getCandidateIntelligence = candidateIntelCrud.get;
const createCandidateIntelligence = candidateIntelCrud.create;
const updateCandidateIntelligence = candidateIntelCrud.update;
const deleteCandidateIntelligence = candidateIntelCrud.delete;

// -- Application Intelligence ------------------------------------------

const applicationIntelligenceSchema = z.object({
  organizationId: z.string(),
  applicationId: z.string(),
  evidenceSummary: z.unknown().optional(),
  fitScore: z.unknown().optional(),
  decisionReadiness: z.unknown().optional(),
  evaluationCount: z.number().default(0),
  lastRunId: z.string().optional(),
});

const applicationIntelCrud = createEntityCrud({
  db,
  table: applicationIntelligence,
  queryKey: "applicationIntelligence",
  idField: "id",
  schema: applicationIntelligenceSchema,
  onMutate: () => safeRevalidate("/roles"),
  getWith: { application: true },
});

const getApplicationIntelligenceList = applicationIntelCrud.list;
const getApplicationIntelligence = applicationIntelCrud.get;
const createApplicationIntelligence = applicationIntelCrud.create;
const updateApplicationIntelligence = applicationIntelCrud.update;
const deleteApplicationIntelligence = applicationIntelCrud.delete;

// -- Interview Intelligence --------------------------------------------

const interviewIntelligenceSchema = z.object({
  organizationId: z.string(),
  interviewId: z.string(),
  prep: z.unknown().optional(),
  evidenceTarget: z.string().optional(),
  transcript: z.string().optional(),
  evaluation: z.unknown().optional(),
  evaluationCount: z.number().default(0),
});

const interviewIntelCrud = createEntityCrud({
  db,
  table: interviewIntelligence,
  queryKey: "interviewIntelligence",
  idField: "id",
  schema: interviewIntelligenceSchema,
  onMutate: () => safeRevalidate("/interviews"),
  getWith: { interview: true },
});

const getInterviewIntelligenceList = interviewIntelCrud.list;
const getInterviewIntelligence = interviewIntelCrud.get;
export const createInterviewIntelligence = interviewIntelCrud.create;
export const updateInterviewIntelligence = interviewIntelCrud.update;
const deleteInterviewIntelligence = interviewIntelCrud.delete;

// -- Offer Intelligence ------------------------------------------------

const offerIntelligenceSchema = z.object({
  organizationId: z.string(),
  offerId: z.string(),
  closeAnalysis: z.unknown().optional(),
  evaluationCount: z.number().default(0),
  lastRunId: z.string().optional(),
});

const offerIntelCrud = createEntityCrud({
  db,
  table: offerIntelligence,
  queryKey: "offerIntelligence",
  idField: "id",
  schema: offerIntelligenceSchema,
  onMutate: () => safeRevalidate("/offers"),
  getWith: { offer: true },
});

const getOfferIntelligenceList = offerIntelCrud.list;
const getOfferIntelligence = offerIntelCrud.get;
const createOfferIntelligence = offerIntelCrud.create;
const updateOfferIntelligence = offerIntelCrud.update;
const deleteOfferIntelligence = offerIntelCrud.delete;

// -- Engagement Intelligence -------------------------------------------

const engagementIntelligenceSchema = z.object({
  organizationId: z.string(),
  engagementId: z.string(),
  draft: z.unknown().optional(),
  evaluationCount: z.number().default(0),
  lastRunId: z.string().optional(),
});

const engagementIntelCrud = createEntityCrud({
  db,
  table: engagementIntelligence,
  queryKey: "engagementIntelligence",
  idField: "id",
  schema: engagementIntelligenceSchema,
  onMutate: () => safeRevalidate("/engagements"),
  getWith: { engagement: true },
});

const getEngagementIntelligenceList = engagementIntelCrud.list;
const getEngagementIntelligence = engagementIntelCrud.get;
const createEngagementIntelligence = engagementIntelCrud.create;
const updateEngagementIntelligence = engagementIntelCrud.update;
const deleteEngagementIntelligence = engagementIntelCrud.delete;

// -- Assessment Intelligence -------------------------------------------

const assessmentIntelligenceSchema = z.object({
  organizationId: z.string(),
  attemptId: z.string(),
  evaluation: z.unknown().optional(),
  evaluationCount: z.number().default(0),
  lastRunId: z.string().optional(),
});

const assessmentIntelCrud = createEntityCrud({
  db,
  table: assessmentIntelligence,
  queryKey: "assessmentIntelligence",
  idField: "id",
  schema: assessmentIntelligenceSchema,
  onMutate: () => safeRevalidate("/pulse"),
  getWith: { attempt: true },
});

const getAssessmentIntelligenceList = assessmentIntelCrud.list;
const getAssessmentIntelligence = assessmentIntelCrud.get;
const createAssessmentIntelligence = assessmentIntelCrud.create;
const updateAssessmentIntelligence = assessmentIntelCrud.update;
const deleteAssessmentIntelligence = assessmentIntelCrud.delete;
