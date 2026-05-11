import { z } from "zod/v4";

// --- Roles ------------------------------------------------------------------

export const roleSchema = z.object({
  organizationId: z.string(),
  title: z.string().min(1),
  team: z.string().optional(),
  department: z.string().optional(),
  hiringManagerId: z.string().optional(),
  recruiterId: z.string().optional(),
  location: z.string().optional(),
  headcount: z.number().int().positive().default(1),
  compensation: z.unknown().optional(),
  description: z.string().optional(),
  businessCase: z.string().optional(),
  criteriaConfig: z.unknown().optional(),
  employmentType: z.string().optional(),
  status: z.string().default("draft"),
  vendorVisibility: z.enum(["internal", "all", "exclusive"]).default("internal"),
  exclusiveVendorOrgId: z.string().nullable().optional(),
  publicVisibility: z.enum(["private", "anonymized", "public"]).default("private").optional(),
  publicSlug: z.string().nullable().optional(),
  kind: z
    .enum(["full_time", "internship", "new_grad", "apprenticeship", "contract"])
    .default("full_time")
    .optional(),
  health: z.string().optional(),
  outcome: z.string().optional(),
  targetHireDate: z.coerce.date<string>().optional(),
});

// --- Candidates -------------------------------------------------------------

export const candidateSchema = z.object({
  organizationId: z.string(),
  userId: z.string().optional(),
  name: z.string().min(1),
  email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email format"),
  phone: z.string().optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  source: z.string().optional(),
  resumeUrl: z.string().optional(),
  resumeText: z.string().optional(),
  tags: z.array(z.string()).optional(),
  skills: z.unknown().optional(),
  experience: z.unknown().optional(),
  education: z.unknown().optional(),
  profile: z.unknown().optional(),
  kind: z.enum(["professional", "student", "early_career"]).default("professional").optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

// --- Pipeline Entries -------------------------------------------------------

export const applicationSchema = z.object({
  organizationId: z.string(),
  roleId: z.string(),
  candidateId: z.string(),
  matchId: z.string().optional(),
  stage: z.string().default("sourced"),
  fitScore: z.number().int().min(0).max(100).optional(),
  daysInStage: z.number().int().optional(),
  source: z.string().optional(),
  recommendation: z.string().optional(),
  recommendedAt: z.coerce.date<string>().optional(),
  approvedAt: z.coerce.date<string>().optional(),
});

// --- Interviews -------------------------------------------------------------

const proposedSlotSchema = z.object({
  startAt: z.string(),
  endAt: z.string(),
});

export const interviewSchema = z.object({
  organizationId: z.string(),
  candidateId: z.string().optional(),
  roleId: z.string().optional(),
  applicationId: z.string(),
  stageId: z.string().optional(),
  interviewType: z.string().optional(),
  scheduledAt: z.coerce.date<string>().optional(),
  durationMins: z.number().int().positive().default(45),
  meetingLink: z.string().optional(),
  location: z.string().optional(),
  evidenceTarget: z.string().optional(),
  transcript: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().default("proposed"),
  proctored: z.boolean().optional(),
  proposedSlots: z.array(proposedSlotSchema).optional(),
});

// --- Scorecards -------------------------------------------------------------

export const scorecardSchema = z.object({
  organizationId: z.string(),
  interviewId: z.string(),
  reviewerId: z.string().optional().nullable(),
  reviewerName: z.string().optional().nullable(),
  ratings: z.unknown().optional().nullable(),
  overallRating: z.number().int().min(1).max(5).optional().nullable(),
  verdict: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// --- Offers -----------------------------------------------------------------

export const offerSchema = z.object({
  organizationId: z.string(),
  candidateId: z.string().optional(),
  roleId: z.string().optional(),
  applicationId: z.string(),
  status: z.string().default("draft"),
  compBase: z.string().optional(),
  compEquity: z.string().optional(),
  compBonus: z.string().optional(),
  startDate: z.coerce.date<string>().optional(),
  compensation: z.unknown().optional(),
  closeRisks: z.unknown().optional(),
  checklist: z.unknown().optional(),
  closeOwnership: z.unknown().optional(),
  approvalChain: z.unknown().optional(),
  recommendation: z.string().optional(),
  extractedOfferLetter: z.unknown().optional(),
  extractedPayStubs: z.unknown().optional(),
  generatedOffer: z.unknown().optional(),
  documentUrl: z.string().optional(),
  validUntil: z.coerce.date<string>().optional(),
  declineReason: z.unknown().optional(),
  declinedAt: z.coerce.date<string>().optional(),
  withdrawReason: z.unknown().optional(),
  withdrawnAt: z.coerce.date<string>().optional(),
  sentAt: z.coerce.date<string>().optional(),
  acceptedAt: z.coerce.date<string>().optional(),
  currentVersionId: z.string().optional(),
});

// --- Talent Pools -----------------------------------------------------------

export const poolSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  criteria: z.unknown().optional(),
  health: z.string().optional(),
});

// --- Pool Members -----------------------------------------------------------

export const poolMemberSchema = z.object({
  organizationId: z.string(),
  poolId: z.string(),
  candidateId: z.string(),
  addedBy: z.string().optional(),
});

// --- Assessments ------------------------------------------------------------

const ASSESSMENT_TYPES = ["technical", "personality", "aptitude", "coding", "case_study", "interview_rubric"] as const;
const ASSESSMENT_ORIGINS = ["org_created", "ai_practice", "ai_rapid_fire", "ai_mock_interview"] as const;
const ASSESSMENT_STATUSES = ["draft", "active", "archived"] as const;
const ASSESSMENT_VISIBILITIES = ["private", "public", "shared"] as const;
const QUESTION_TYPES = ["SHORT_TEXT", "LONG_TEXT", "MCQ", "MULTI_SELECT", "CODING_SNIPPET", "SCALE", "BOOLEAN"] as const;
const ATTEMPT_STATUSES = ["pending", "in-progress", "submitted", "evaluated", "completed", "expired", "cancelled"] as const;

export const assessmentSchema = z.object({
  organizationId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(ASSESSMENT_TYPES).optional(),
  origin: z.enum(ASSESSMENT_ORIGINS).default("org_created"),
  config: z.unknown().optional(),
  visibility: z.enum(ASSESSMENT_VISIBILITIES).default("private"),
  status: z.enum(ASSESSMENT_STATUSES).default("draft"),
});

export const assessmentQuestionSchema = z.object({
  assessmentId: z.string(),
  text: z.string().min(1),
  type: z.enum(QUESTION_TYPES).default("SHORT_TEXT"),
  order: z.number().int().default(0),
  weight: z.number().int().default(1),
  options: z.unknown().optional(),
  correctAnswer: z.unknown().optional(),
  rubric: z.unknown().optional(),
});

export const assessmentAttemptSchema = z.object({
  organizationId: z.string(),
  assessmentId: z.string(),
  candidateId: z.string(),
  applicationId: z.string().optional(),
  interviewId: z.string().optional(),
  status: z.enum(ATTEMPT_STATUSES).default("pending"),
  score: z.number().int().min(0).max(100).optional(),
  answers: z.unknown().optional(),
  evaluation: z.unknown().optional(),
  startedAt: z.coerce.date<string>().optional(),
  submittedAt: z.coerce.date<string>().optional(),
  evaluatedAt: z.coerce.date<string>().optional(),
  deadlineAt: z.coerce.date<string>().optional(),
});

// --- Engagement -------------------------------------------------------------

const engagementSchema = z.object({
  organizationId: z.string(),
  recipientId: z.string(),
  recipientType: z.string().default("candidate"),
  type: z.string(),
  channel: z.string().default("email"),
  subject: z.string().optional(),
  body: z.string().optional(),
  status: z.string().default("draft"),
});

// --- Triage Items -----------------------------------------------------------

export const triageItemSchema = z.object({
  organizationId: z.string(),
  type: z.string(),
  urgency: z.string(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  roleId: z.string().optional(),
  candidateId: z.string().optional(),
  action: z.string().optional(),
  status: z.string().default("active"),
});

// --- Departments -----------------------------------------------------------

export const departmentSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  leadUserId: z.string().optional(),
  leadName: z.string().optional(),
});

// --- Org Identity ----------------------------------------------------------

const orgIdentitySchema = z.object({
  organizationId: z.string(),
  rawText: z.string().optional(),
  uploadedDocuments: z.unknown().optional(),
});

// --- Portal ----------------------------------------------------------------

export const updatePortalProfileSchema = z.object({
  candidateId: z.string(),
  name: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  tags: z.array(z.string()).optional(),
  about: z.string().optional(),
  profile: z.record(z.string(), z.unknown()).optional(),
});
