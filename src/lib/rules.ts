/**
 * Rules Engine — flat rule map replacing DAGs, EventRouter, TaskCatalog, and Azflow.
 *
 * PG trigger → pgmq → worker → match rule → call function(s) sequentially.
 *
 * entity_notes are now in the PG trigger list (scripts/crud-triggers.sql) so
 * SSE clients see real-time note events. Adding an entityNote:insert rule
 * here would let workers re-evaluate matches based on note content — not
 * yet implemented; defer until there's a concrete signal we want to extract
 * from notes (e.g., "watch for next role" tags).
 */

import { updateEmbedding } from "@/automations/tasks/embedding";
import { candidateIntake } from "@/automations/tasks/candidate";
import { roleIntake, roleHealthAnalyzerFromApplication } from "@/automations/tasks/role";
import { scheduledDailyTriage } from "@/automations/tasks/scheduled";
import { evaluateMatchesForCandidate, evaluateMatchesForRole, evaluateMatchForApplication } from "@/automations/tasks/match";
import { pipelineUpdateEvidence, pipelineCheckDecisionReadiness, pipelineAssignAssessment } from "@/automations/tasks/pipeline";
import { interviewIntake, interviewProcessEvidence, evaluateMatchForInterview, evaluateTranscriptAssessmentsForInterview } from "@/automations/tasks/interview";
import { offerCreateFromApplication, offerAnalyzeClose, offerAnalyzeLeverage, offerResolve, offerGenerateRecommendation } from "@/automations/tasks/offer";
import { engagementSend, engagementCheckResponse } from "@/automations/tasks/engagement";
import { assessmentEvaluate, assessmentUpdateApplicationEvidence } from "@/automations/tasks/assessment";
import { poolIntake, poolRefreshStats, evaluatePoolsForCandidate, evaluateCandidatesForPool, updatePoolsMatchingRoles } from "@/automations/tasks/pool";
import { tourSeedFirstRole, tourSeedFirstCandidate, tourSeedFirstInterview, tourSeedFirstOffer, tourSeedFirstAssessment } from "@/automations/tasks/tours";

// -- Types --------------------------------------------------------------

export interface CrudEvent {
  entityType: string;
  operation: "insert" | "update" | "delete";
  entityId: string;
  organizationId: string;
  userId?: string;
  userName?: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
}

interface Rule {
  id: string;
  entityType: string;
  operation: "insert" | "update";
  condition?: (event: CrudEvent) => boolean;
  tasks: Array<(params: any) => Promise<unknown>>;
}

interface TaskParams {
  organizationId: string;
  entityId: string;
  traceId?: string;
  data?: Record<string, unknown>;
}

// -- Helper: detect field change ----------------------------------------

function changedTo(event: CrudEvent, field: string, value: string): boolean {
  const oldVal = event.oldData?.[field];
  const newVal = event.newData?.[field];
  const result = newVal === value && oldVal !== value;
  if (event.entityType === "assessmentAttempt") {
    console.log(`[rules:debug] changedTo(${field}, ${value}): old=${oldVal}, new=${newVal}, result=${result}`);
  }
  return result;
}

function changed(event: CrudEvent, field: string): boolean {
  return event.oldData?.[field] !== event.newData?.[field];
}

// -- Rules --------------------------------------------------------------

const rules: Rule[] = [
  // -- Role --
  {
    id: "role:insert",
    entityType: "role",
    operation: "insert",
    tasks: [roleIntake, evaluateMatchesForRole, updatePoolsMatchingRoles, tourSeedFirstRole],
  },
  {
    id: "role:update:open",
    entityType: "role",
    operation: "update",
    condition: (e) => changedTo(e, "status", "open"),
    tasks: [roleIntake, evaluateMatchesForRole, updatePoolsMatchingRoles],
  },
  {
    id: "role:update:close",
    entityType: "role",
    operation: "update",
    condition: (e) =>
      changedTo(e, "status", "filled") || changedTo(e, "status", "cancelled"),
    tasks: [],
  },
  {
    id: "role:update:criteria",
    entityType: "role",
    operation: "update",
    condition: (e) => changed(e, "criteria_config"),
    tasks: [evaluateMatchesForRole, updatePoolsMatchingRoles],
  },

  // -- Candidate --
  {
    id: "candidate:insert",
    entityType: "candidate",
    operation: "insert",
    // candidateIntake extracts profile, then evaluate matches/pools with that data
    tasks: [candidateIntake, evaluateMatchesForCandidate, evaluatePoolsForCandidate, tourSeedFirstCandidate],
  },
  {
    id: "candidate:update:resume",
    entityType: "candidate",
    operation: "update",
    condition: (e) => changed(e, "resume_text"),
    tasks: [candidateIntake, evaluateMatchesForCandidate, evaluatePoolsForCandidate],
  },
  {
    id: "candidate:update:profile",
    entityType: "candidate",
    operation: "update",
    condition: (e) => changed(e, "profile") || changed(e, "skills"),
    tasks: [evaluateMatchesForCandidate, evaluatePoolsForCandidate],
  },

  // -- Application (Pipeline) --
  {
    id: "application:insert",
    entityType: "application",
    operation: "insert",
    tasks: [pipelineAssignAssessment, roleHealthAnalyzerFromApplication],
  },
  {
    id: "application:update:stage",
    entityType: "application",
    operation: "update",
    condition: (e) => changed(e, "stage") && !["rejected", "withdrawn", "hired"].includes(e.newData?.stage as string),
    tasks: [pipelineUpdateEvidence, pipelineCheckDecisionReadiness, roleHealthAnalyzerFromApplication],
  },
  {
    id: "application:update:stage:offer",
    entityType: "application",
    operation: "update",
    condition: (e) => changedTo(e, "stage", "offer"),
    tasks: [offerCreateFromApplication],
  },

  // -- Interview --
  {
    id: "interview:insert",
    entityType: "interview",
    operation: "insert",
    tasks: [interviewIntake, tourSeedFirstInterview],
  },
  {
    id: "interview:update:transcript",
    entityType: "interview",
    operation: "update",
    condition: (e) => changed(e, "transcript"),
    tasks: [evaluateTranscriptAssessmentsForInterview, interviewProcessEvidence],
  },
  // Note: no rule on status=completed — that's lifecycle/UI only.
  // Evidence triggers are: transcript changed + scorecard inserted.

  // -- Scorecard — new or updated evidence --
  {
    id: "scorecard:insert",
    entityType: "scorecard",
    operation: "insert",
    tasks: [interviewProcessEvidence],
  },
  {
    id: "scorecard:update",
    entityType: "scorecard",
    operation: "update",
    tasks: [interviewProcessEvidence],
  },

  // -- Interview Intelligence — evaluation saved, update match --
  {
    id: "interviewIntelligence:update:evaluation",
    entityType: "interviewIntelligence",
    operation: "update",
    condition: (e) => changed(e, "evaluation"),
    tasks: [evaluateMatchForInterview],
  },

  // -- Offer --
  {
    id: "offer:insert",
    entityType: "offer",
    operation: "insert",
    tasks: [offerAnalyzeClose, offerAnalyzeLeverage, tourSeedFirstOffer],
  },
  {
    id: "offer:update:accepted",
    entityType: "offer",
    operation: "update",
    condition: (e) => changedTo(e, "status", "accepted"),
    tasks: [offerResolve],
  },
  {
    id: "offer:update:declined",
    entityType: "offer",
    operation: "update",
    condition: (e) => changedTo(e, "status", "declined"),
    tasks: [offerResolve],
  },
  {
    id: "offer:update:generate-recommendation",
    entityType: "offer",
    operation: "update",
    condition: (e) => {
      const hasNow = e.newData?.extracted_offer_letter != null;
      const hadBefore = e.oldData?.extracted_offer_letter != null;
      return hasNow && !hadBefore;
    },
    tasks: [offerGenerateRecommendation],
  },

  // -- Engagement --
  {
    id: "engagement:update:sent",
    entityType: "engagement",
    operation: "update",
    condition: (e) => changedTo(e, "status", "sent"),
    tasks: [engagementSend, engagementCheckResponse],
  },

  // -- Assessment Attempts --
  {
    id: "assessmentAttempt:update:submitted",
    entityType: "assessmentAttempt",
    operation: "update",
    condition: (e) => changedTo(e, "status", "submitted"),
    tasks: [assessmentEvaluate],
  },
  {
    id: "assessmentAttempt:update:evaluated",
    entityType: "assessmentAttempt",
    operation: "update",
    condition: (e) => changedTo(e, "status", "evaluated"),
    tasks: [assessmentUpdateApplicationEvidence, evaluateMatchForApplication],
  },

  // -- Pool --
  {
    id: "pool:insert",
    entityType: "pool",
    operation: "insert",
    // 1. poolIntake: extract criteria + match roles (needed for candidate matching)
    // 2. evaluateCandidatesForPool: add matching candidates
    // 3. poolIntake again: refresh AI insight with actual member count
    tasks: [poolIntake, evaluateCandidatesForPool, poolIntake],
  },
  {
    id: "pool:update:description",
    entityType: "pool",
    operation: "update",
    condition: (e) => changed(e, "description") || changed(e, "name"),
    // 1. poolIntake: re-extract criteria from updated description
    // 2. evaluateCandidatesForPool: re-evaluate all candidates (add new matches, remove non-matches)
    // 3. poolIntake: refresh stats with updated member count
    tasks: [poolIntake, evaluateCandidatesForPool, poolIntake],
  },

  // -- Pool Member --
  {
    id: "pool_member:insert",
    entityType: "pool_member",
    operation: "insert",
    tasks: [poolRefreshStats],
  },

  // -- Embedding (search index) --
  {
    id: "embedding:candidate:insert",
    entityType: "candidate",
    operation: "insert",
    tasks: [updateEmbedding],
  },
  {
    id: "embedding:candidate:update",
    entityType: "candidate",
    operation: "update",
    tasks: [updateEmbedding],
  },
  {
    id: "embedding:role:insert",
    entityType: "role",
    operation: "insert",
    tasks: [updateEmbedding],
  },
  {
    id: "embedding:role:update",
    entityType: "role",
    operation: "update",
    tasks: [updateEmbedding],
  },
  {
    id: "embedding:interview:insert",
    entityType: "interview",
    operation: "insert",
    tasks: [updateEmbedding],
  },
  {
    id: "embedding:interview:update",
    entityType: "interview",
    operation: "update",
    tasks: [updateEmbedding],
  },

  // -- Scheduled --
  {
    id: "scheduled:daily_triage",
    entityType: "scheduled",
    operation: "insert",
    tasks: [scheduledDailyTriage],
  },
];

// -- Matcher ------------------------------------------------------------

export function matchRules(event: CrudEvent): Rule[] {
  return rules.filter((rule) => {
    if (rule.entityType !== event.entityType) return false;
    if (rule.operation !== event.operation) return false;
    if (rule.condition && !rule.condition(event)) return false;
    return true;
  });
}
