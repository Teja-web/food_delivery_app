/**
 * match.evaluate — Single function to evaluate (or re-evaluate) a role-candidate match.
 *
 * Called from every direction:
 *   - Candidate created/updated → evaluate against all open roles
 *   - Role created/criteria changed → evaluate against all org candidates
 *   - Pipeline event (scorecard, interview, assessment) → re-evaluate that specific match
 */

import { db } from "@/db/client";
import { candidates, roles, matches as matchesTable, applications, pools, interviews, assessmentAttempts } from "@/db/schema";
import { eq, and, inArray, sql, isNull } from "drizzle-orm";
import { logExecution } from "@/lib/execution-log";
import { searchHybrid } from "@/lib/search";
import { roleCandidateMatcherPrompt } from "../agents/prompts/role-candidate-matcher";
import { roleCandidateMatcherAgent, roleCandidateMatchSchema } from "../agents/definitions/role-candidate-matcher";
import { studentRoleMatcherPrompt } from "../agents/prompts/student-role-matcher";
import { studentRoleMatcherAgent, studentRoleMatchSchema } from "../agents/definitions/student-role-matcher";
import { generate } from "@/lib/ai";
import { getCandidateContext } from "@/operations/candidates";
import { getRoleContext } from "@/operations/roles";
import type { RoleCriteriaConfig, RoleKind } from "@/db/schema/roles";

/**
 * Role kinds whose hiring profile is student-shaped — internships, new-grad
 * tracks, structured apprenticeships. Selecting the student matcher for
 * these is correct (the matcher's growth-potential rubric matches the
 * actual screen).
 *
 * Explicitly NOT included: `contract` (could be a senior consultant) and
 * `full_time` (lateral hire). Earlier code used `kind !== "full_time"`
 * which incorrectly forced the student matcher onto contract roles —
 * senior contractors got under-scored on growth-potential criteria.
 */
const STUDENT_SHAPED_ROLE_KINDS: ReadonlyArray<RoleKind> = [
  "internship",
  "new_grad",
  "apprenticeship",
];

const BATCH_CONCURRENCY = 5;
const MATCH_SEARCH_LIMIT = 5;
const MATCH_SEARCH_THRESHOLD = 0.1;
const MATCH_FIT_SCORE_THRESHOLD = 20;

/* -- Deterministic scoring (fixes #33 / #18) ------------------------------ */

const STRENGTH_SCORES: Record<string, number> = {
  strong: 85,
  moderate: 60,
  weak: 30,
  none: 0,
};

const WEIGHT_MULTIPLIERS: Record<string, number> = {
  critical: 3,
  important: 2,
  nice_to_have: 1,
};

function deriveRecommendation(fitScore: number): "strong_yes" | "yes" | "maybe" | "no" | "strong_no" {
  if (fitScore >= 85) return "strong_yes";
  if (fitScore >= 70) return "yes";
  if (fitScore >= 50) return "maybe";
  if (fitScore >= 30) return "no";
  return "strong_no";
}

/**
 * Compute fitScore and recommendation deterministically from LLM strength buckets
 * and role criteria weights. Same inputs always produce same outputs.
 */
function computeMatchScore(
  alignment: Array<{ criterion: string; strength: string; evidence: string; sources: ("resume" | "interview" | "assessment" | "talent_score")[] }>,
  criteriaConfig: RoleCriteriaConfig | null,
) {
  if (!alignment.length) return { fitScore: 0, recommendation: "strong_no" as const, scoredAlignment: [] };

  // Build weight lookup from role criteria
  const criteriaWeights = new Map<string, string>();
  if (criteriaConfig?.criteria) {
    for (const c of criteriaConfig.criteria) {
      criteriaWeights.set(c.name.toLowerCase(), c.weight);
    }
  }

  let totalWeight = 0;
  let weightedSum = 0;
  const scoredAlignment = alignment.map((a) => {
    const score = STRENGTH_SCORES[a.strength] ?? 0;
    // Match criterion name to role criteria for weight; default to "important"
    const weight = criteriaWeights.get(a.criterion.toLowerCase()) ?? "important";
    const multiplier = WEIGHT_MULTIPLIERS[weight] ?? 1;
    totalWeight += multiplier;
    weightedSum += score * multiplier;
    return { criterion: a.criterion, score, evidence: a.evidence, sources: a.sources };
  });

  const fitScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  const recommendation = deriveRecommendation(fitScore);

  return { fitScore, recommendation, scoredAlignment };
}

/* -- Source-claim integrity check ------------------------------------- */

type ProfessionalAlignment = Array<{
  criterion: string;
  strength: string;
  evidence: string;
  sources: ("resume" | "interview" | "assessment" | "talent_score")[];
}>;

/**
 * Strip claimed "interview" / "assessment" sources from alignment when no
 * matching DB rows exist for the role-candidate pair. Without this, an agent
 * could falsely tag sources and make `evidenceBasis` overstate confidence.
 *
 * Falls back to ["resume"] when stripping leaves a criterion sourceless —
 * the candidate had to produce some signal for the agent to score them.
 */
async function validateAlignmentSources(
  alignment: ProfessionalAlignment,
  roleId: string,
  candidateId: string,
): Promise<{ alignment: ProfessionalAlignment; strippedCount: number }> {
  const claimsInterview = alignment.some((a) => a.sources.includes("interview"));
  const claimsAssessment = alignment.some((a) => a.sources.includes("assessment"));
  if (!claimsInterview && !claimsAssessment) {
    return { alignment, strippedCount: 0 };
  }

  const [interviewRows, attemptRows] = await Promise.all([
    claimsInterview
      ? db
          .select({ id: interviews.id })
          .from(interviews)
          .where(
            and(
              eq(interviews.roleId, roleId),
              eq(interviews.candidateId, candidateId),
              eq(interviews.status, "completed"),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    claimsAssessment
      ? db
          .select({ id: assessmentAttempts.id })
          .from(assessmentAttempts)
          .innerJoin(applications, eq(assessmentAttempts.applicationId, applications.id))
          .where(
            and(
              eq(applications.roleId, roleId),
              eq(applications.candidateId, candidateId),
              eq(assessmentAttempts.candidateId, candidateId),
              inArray(assessmentAttempts.status, ["submitted", "evaluated", "completed"]),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
  ]);

  const hasInterviews = interviewRows.length > 0;
  const hasAttempts = attemptRows.length > 0;

  let strippedCount = 0;
  const cleaned = alignment.map((a) => {
    let next = a.sources;
    if (!hasInterviews && next.includes("interview")) {
      next = next.filter((s) => s !== "interview");
    }
    if (!hasAttempts && next.includes("assessment")) {
      next = next.filter((s) => s !== "assessment");
    }
    if (next.length === 0) {
      next = ["resume"];
    }
    if (next.length !== a.sources.length || next.some((s, i) => s !== a.sources[i])) {
      strippedCount++;
      return { ...a, sources: next };
    }
    return a;
  });

  return { alignment: cleaned, strippedCount };
}

/* -- Universal pre-filter + batch evaluate ---------------------------- */

/**
 * Semantic pre-filter → batch agent evaluation.
 * Works for any source that can produce a search query and a target entity type.
 *
 * @param query       - Search text derived from the source entity
 * @param tableName   - Documents table to search ("candidates" or "roles")
 * @param orgId       - Organization scope
 * @param limit       - Max candidates to evaluate
 * @param buildPairs  - Given matching IDs, return (roleId, candidateId) pairs
 * @param traceId     - Optional trace ID for audit
 */
async function semanticFilterAndEvaluate(opts: {
  query: string;
  tableName: string;
  organizationId?: string;
  limit: number;
  buildPairs: (ids: string[]) => Promise<{ roleId: string; candidateId: string; organizationId?: string }[]>;
  traceId?: string;
  searchOptions?: { join?: any; where?: any };
}) {
  const { query, tableName, organizationId, limit, buildPairs, traceId, searchOptions } = opts;

  const hits = await searchHybrid(db as any, query, tableName, {
    organizationId,
    limit,
    threshold: MATCH_SEARCH_THRESHOLD,
    ...searchOptions,
  });

  if (hits.length === 0) return { success: true, matchCount: 0, matches: [] };

  const pairs = await buildPairs(hits.map((h) => h.record.id));
  if (pairs.length === 0) return { success: true, matchCount: 0, matches: [] };

  const scoped: { organizationId: string; roleId: string; candidateId: string; traceId?: string }[] = [];
  for (const p of pairs) {
    const orgId = p.organizationId ?? organizationId;
    if (!orgId) continue;
    scoped.push({ organizationId: orgId, roleId: p.roleId, candidateId: p.candidateId, traceId });
  }

  const results = await evaluateBatch(scoped);

  return { success: true, matchCount: results.length, matches: results };
}

/**
 * Run evaluateMatch on a batch of pairs with bounded concurrency.
 */
async function evaluateBatch(
  pairs: { organizationId: string; roleId: string; candidateId: string; traceId?: string }[],
) {
  const results: any[] = [];
  for (let i = 0; i < pairs.length; i += BATCH_CONCURRENCY) {
    const batch = pairs.slice(i, i + BATCH_CONCURRENCY);
    const batchResults = await Promise.all(batch.map((p) => evaluateMatch(p)));
    results.push(...batch.map((p, j) => ({ ...p, ...batchResults[j] })));
  }
  return results;
}

/* -- Query builders ---------------------------------------------------- */

function buildRoleSearchQuery(role: { title: string; description?: string | null; criteriaConfig?: any }): string {
  const parts = [role.title];
  if (role.criteriaConfig?.criteria) {
    parts.push(role.criteriaConfig.criteria.map((c: any) => `${c.name} ${c.description}`).join(" "));
  }
  if (role.criteriaConfig?.keywords) {
    parts.push(role.criteriaConfig.keywords.map((k: any) => k.term).join(" "));
  }
  if (role.description) parts.push(role.description);
  return parts.join(" ").slice(0, 8000);
}

function buildCandidateSearchQuery(candidate: { name: string; title?: string | null; skills?: string[] | null; resumeText?: string | null }): string {
  const parts = [];
  if (candidate.title) parts.push(candidate.title);
  if (candidate.skills?.length) parts.push(candidate.skills.join(" "));
  if (candidate.resumeText) parts.push(candidate.resumeText);
  return parts.join(" ").slice(0, 8000) || candidate.name;
}

function buildPoolSearchQuery(pool: { name: string; description?: string | null; criteria?: any }): string {
  const parts = [pool.name];
  if (pool.criteria?.skills?.length) parts.push(pool.criteria.skills.join(" "));
  if (pool.criteria?.locations?.length) parts.push(pool.criteria.locations.join(" "));
  if (pool.criteria?.tags?.length) parts.push(pool.criteria.tags.join(" "));
  if (pool.description) parts.push(pool.description);
  return parts.join(" ").slice(0, 8000);
}

/* -- Core: evaluate a single role-candidate pair ----------------------- */

async function evaluateMatch(params: {
  organizationId: string;
  roleId: string;
  candidateId: string;
  traceId?: string;
}): Promise<{ skipped?: boolean; reason?: string; fitScore?: number; recommendation?: string }> {
  const { organizationId, roleId, candidateId, traceId } = params;

  // Entity context building blocks — includes intelligence, interviews, assessments, match history
  const [candidateContext, roleContext] = await Promise.all([
    getCandidateContext(candidateId),
    getRoleContext(roleId),
  ]);

  if (!candidateContext) return { skipped: true, reason: "candidate_not_found" };
  if (!roleContext) return { skipped: true, reason: "role_not_found" };

  // Fetch the criteria config + the discriminators that pick the matcher.
  const [role, candidate] = await Promise.all([
    db.query.roles.findFirst({
      where: eq(roles.id, roleId),
      columns: { criteriaConfig: true, kind: true },
    }),
    db.query.candidates.findFirst({
      where: eq(candidates.id, candidateId),
      columns: { kind: true },
    }),
  ]);

  // Matcher selection: student matcher when either side is student-shaped.
  // Both matchers share the alignment/strength contract so downstream
  // deterministic scoring (`computeMatchScore`) is unchanged.
  //
  // Role-side: only the explicitly student-shaped kinds (internship,
  // new_grad, apprenticeship). `contract` and `full_time` go to the
  // professional matcher regardless.
  const useStudentMatcher =
    candidate?.kind === "student" ||
    candidate?.kind === "early_career" ||
    (role?.kind !== undefined && STUDENT_SHAPED_ROLE_KINDS.includes(role.kind));

  const matcherPrompt = useStudentMatcher
    ? studentRoleMatcherPrompt
    : roleCandidateMatcherPrompt;
  const matcherAgent = useStudentMatcher
    ? studentRoleMatcherAgent
    : roleCandidateMatcherAgent;
  const matcherSchema = useStudentMatcher
    ? studentRoleMatchSchema
    : roleCandidateMatchSchema;

  const prompt = `${matcherPrompt}\n\n${candidateContext}\n\n${roleContext}`;

  const result = await generate({ agent: matcherAgent, prompt, output: matcherSchema });
  const match = (result as any).object as typeof roleCandidateMatchSchema._output;

  // Integrity check — only the professional matcher claims interview/assessment
  // sources. Strip claims that aren't backed by real DB rows so evidenceBasis
  // can't overstate confidence.
  let validatedAlignment: typeof match.alignment = match.alignment;
  if (!useStudentMatcher) {
    const validation = await validateAlignmentSources(
      match.alignment as ProfessionalAlignment,
      roleId,
      candidateId,
    );
    if (validation.strippedCount > 0) {
      console.log(
        `[match.evaluate] Stripped unbacked source claim(s) on ${validation.strippedCount}/${match.alignment.length} criteria — role=${roleId} candidate=${candidateId}`,
      );
    }
    validatedAlignment = validation.alignment as typeof match.alignment;
  }

  // Deterministic scoring: LLM strength buckets → numeric scores via fixed mapping
  const { fitScore, recommendation, scoredAlignment: alignment } = computeMatchScore(
    validatedAlignment,
    role?.criteriaConfig as RoleCriteriaConfig | null,
  );

  // Skip low-scoring matches (don't create new records for poor fits)
  const existing = await db.query.matches.findFirst({
    where: and(eq(matchesTable.roleId, roleId), eq(matchesTable.candidateId, candidateId)),
  });

  if (!existing && fitScore < MATCH_FIT_SCORE_THRESHOLD) {
    return { skipped: true, reason: "below_score_threshold", fitScore };
  }

  // Upsert match record
  let matchId: string;

  if (existing) {
    await db.update(matchesTable).set({
      fitScore,
      recommendation,
      alignment,
      signal: match.signal,
      gaps: match.gaps,
      summary: match.summary,
      evaluationCount: existing.evaluationCount + 1,
      lastEvaluatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(matchesTable.id, existing.id));
    matchId = existing.id;
  } else {
    const [newMatch] = await db.insert(matchesTable).values({
      organizationId,
      roleId,
      candidateId,
      fitScore,
      recommendation,
      alignment,
      signal: match.signal,
      gaps: match.gaps,
      summary: match.summary,
      status: "active",
      lastEvaluatedAt: new Date(),
    }).returning();
    matchId = newMatch.id;
  }

  // Link any unlinked application for this pair
  await db.update(applications).set({ matchId, updatedAt: new Date() }).where(
    and(
      eq(applications.roleId, roleId),
      eq(applications.candidateId, candidateId),
      isNull(applications.matchId),
    ),
  );

  // Execution log — match data lives on the matches table, log points to it
  await logExecution({
    db,
    taskId: "match-evaluate",
    organizationId,
    entityType: "match",
    entityId: matchId,
    status: "completed",
    traceId,
    actorId: matcherAgent.slug,
    outputTable: "matches",
    outputId: matchId,
    outputAction: existing ? "updated" : "created",
  });

  return { fitScore, recommendation };
}

/* -- Orchestrators: pre-filter with semantic search, then batch eval -- */

/**
 * Candidate created/updated → find best-matching open roles, evaluate.
 */
export async function evaluateMatchesForCandidate(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
}) {
  const { organizationId, entityId: candidateId, traceId } = params;

  const candidate = await db.query.candidates.findFirst({
    where: eq(candidates.id, candidateId),
  });
  if (!candidate) return { success: false, reason: "candidate_not_found" };
  if (candidate.status !== "active") return { success: true, matchCount: 0, matches: [], reason: "candidate_inactive" };
  if (!candidate.resumeText && !candidate.profile) return { success: true, matchCount: 0, matches: [] };

  // Find and evaluate new matches via semantic search, scoped to this org.
  // (Phase 2 of vendor-and-attribution-plan.md — the prior PLATFORM_ORG_ID
  // branch is gone now that org_candidates drives membership.)
  const newMatches = await semanticFilterAndEvaluate({
    query: buildCandidateSearchQuery(candidate),
    tableName: "roles",
    organizationId,
    limit: MATCH_SEARCH_LIMIT,
    traceId,
    searchOptions: {
      join: sql`LEFT JOIN dilliznt.matches m ON m.role_id = d.record_id AND m.candidate_id = ${candidateId}`,
      where: sql`m.id IS NULL`,
    },
    buildPairs: async (ids) => {
      const matched = await db.query.roles.findMany({
        where: and(inArray(roles.id, ids), eq(roles.status, "open")),
      });
      return matched
        .filter((r) => r.criteriaConfig)
        .map((r) => ({ roleId: r.id, candidateId, organizationId: r.organizationId }));
    },
  });

  // Re-evaluate all existing active matches for this candidate
  const existingMatches = await db.query.matches.findMany({
    where: and(
      eq(matchesTable.candidateId, candidateId),
      eq(matchesTable.status, "active"),
    ),
  });

  const reEvalResults = await evaluateBatch(
    existingMatches.map((m) => ({ organizationId: m.organizationId, roleId: m.roleId, candidateId, traceId })),
  );

  return {
    success: true,
    matchCount: (newMatches.matchCount ?? 0) + reEvalResults.length,
    matches: [...(newMatches.matches ?? []), ...reEvalResults],
  };
}

/**
 * Role created/updated → find best-matching candidates, evaluate.
 */
export async function evaluateMatchesForRole(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
}) {
  const { organizationId, entityId: roleId, traceId } = params;

  const role = await db.query.roles.findFirst({
    where: eq(roles.id, roleId),
  });
  if (!role) return { success: false, reason: "role_not_found" };
  if (!role.criteriaConfig) return { success: true, matchCount: 0, matches: [] };

  return semanticFilterAndEvaluate({
    query: buildRoleSearchQuery(role),
    tableName: "candidates",
    organizationId,
    limit: MATCH_SEARCH_LIMIT,
    traceId,
    searchOptions: {
      join: sql`LEFT JOIN dilliznt.matches m ON m.candidate_id = d.record_id AND m.role_id = ${roleId}`,
      where: sql`m.id IS NULL`,
    },
    buildPairs: async (ids) => {
      const matched = await db.query.candidates.findMany({
        where: and(inArray(candidates.id, ids), eq(candidates.status, "active")),
      });
      return matched
        .filter((c) => c.resumeText || c.profile)
        .map((c) => ({ roleId, candidateId: c.id }));
    },
  });
}

/**
 * Pool created/updated → find best-matching candidates, evaluate against
 * each of the pool's matching roles.
 */
async function evaluateMatchesForPool(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
}) {
  const { organizationId, entityId: poolId, traceId } = params;

  const pool = await db.query.pools.findFirst({
    where: eq(pools.id, poolId),
  });
  if (!pool) return { success: false, reason: "pool_not_found" };

  // Get roles linked to this pool
  const poolRoleIds = (pool.matchingRoleIds ?? []) as string[];
  if (poolRoleIds.length === 0) return { success: true, matchCount: 0, matches: [] };

  const poolRoles = await db.query.roles.findMany({
    where: and(inArray(roles.id, poolRoleIds), eq(roles.status, "open")),
  });
  const validRoles = poolRoles.filter((r) => r.criteriaConfig);
  if (validRoles.length === 0) return { success: true, matchCount: 0, matches: [] };

  return semanticFilterAndEvaluate({
    query: buildPoolSearchQuery(pool),
    tableName: "candidates",
    organizationId,
    limit: MATCH_SEARCH_LIMIT,
    traceId,
    buildPairs: async (ids) => {
      const matched = await db.query.candidates.findMany({
        where: and(inArray(candidates.id, ids), eq(candidates.status, "active")),
      });
      const valid = matched.filter((c) => c.resumeText || c.profile);
      // Cross-product: each candidate × each role
      return valid.flatMap((c) =>
        validRoles.map((r) => ({ roleId: r.id, candidateId: c.id })),
      );
    },
  });
}

/**
 * Pipeline event (scorecard, interview, assessment, application) →
 * resolve to the application, then re-evaluate the match.
 * Handles entityId being an interview, scorecard, assessmentAttempt, or application.
 */
export async function evaluateMatchForApplication(params: {
  organizationId: string;
  entityId: string;
  entityType?: string;
  traceId?: string;
}) {
  const { organizationId, entityId, entityType, traceId } = params;

  let applicationId = entityId;

  // Resolve entity → application
  if (entityType === "interview") {
    const { interviews } = await import("@/db/schema");
    const interview = await db.query.interviews.findFirst({
      where: eq(interviews.id, entityId),
      columns: { applicationId: true },
    });
    if (!interview) return { skipped: true, reason: "interview_not_found" };
    applicationId = interview.applicationId;
  } else if (entityType === "scorecard") {
    const { scorecards, interviews } = await import("@/db/schema");
    const card = await db.query.scorecards.findFirst({
      where: eq(scorecards.id, entityId),
      columns: { interviewId: true },
    });
    if (!card) return { skipped: true, reason: "scorecard_not_found" };
    const interview = await db.query.interviews.findFirst({
      where: eq(interviews.id, card.interviewId),
      columns: { applicationId: true },
    });
    if (!interview) return { skipped: true, reason: "interview_not_found" };
    applicationId = interview.applicationId;
  } else if (entityType === "assessmentAttempt") {
    const { assessmentAttempts } = await import("@/db/schema");
    const attempt = await db.query.assessmentAttempts.findFirst({
      where: eq(assessmentAttempts.id, entityId),
      columns: { applicationId: true },
    });
    if (!attempt?.applicationId) return { skipped: true, reason: "attempt_has_no_application" };
    applicationId = attempt.applicationId;
  }

  const entry = await db.query.applications.findFirst({
    where: eq(applications.id, applicationId),
  });
  if (!entry) return { skipped: true, reason: "application_not_found" };

  return evaluateMatch({
    organizationId,
    roleId: entry.roleId,
    candidateId: entry.candidateId,
    traceId,
  });
}
